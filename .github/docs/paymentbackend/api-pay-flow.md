# `/api/pay` Flow Guide

This document describes how the unified `GET /api/pay` endpoint negotiates and settles payments for both fiat QR and x402 crypto paths. Use it whenever you need to reason about changes that impact payment orchestration or when instructing another LLM to touch this flow.

## 1. Request Shape

- **Method / Path:** `GET /api/pay`
- **Headers:** Optional `X-PAYMENT` (base64 JSON). Required only when the client submits a payment payload.
- **Query parameters:**
  - `orderId` _(string, required)_ – business identifier, reused in job maps and webhook payloads.
  - `amountUsd` _(number, required)_ – amount in USD for the crypto path (converted to USDC atomic units).
  - `description` _(string, optional)_ – memo/description; reused for fiat glosa sanitization when available.
  - `resource` _(string, optional)_ – friendly resource label for x402 metadata (defaults to `Product`).
  - `fiatAmount` _(number, optional)_ – local currency amount offered inside the QR option. Falls back to `amountUsd` when omitted.
  - `currency` _(string, optional)_ – fiat currency code (default `BOB`).
  - `symbol` _(string, optional)_ – fiat currency symbol (default `Bs.`).
  - `requiresManualConfirmation` _(boolean, optional)_ – whether crypto settlements should pause until a human confirms.

## 2. Payment Job Creation

1. `X402PaymentService.createPaymentJob` is called before any branching logic. It deduplicates by `orderId`, returning the existing job if one is still active.
2. Payment requirements (`PaymentRequirements`) describe the EIP-3009 authorization to be signed by the client. These values seed the crypto option exposed in the HTTP 402 response.
3. Jobs live in memory (Map keyed by `jobId`), track status transitions (`payment_required`, `verifying`, `settled`, etc.), and expire after `X402_PAYMENT_TIMEOUT_MS` (default 5 minutes).

## 3. Negotiation Phase (no `X-PAYMENT` header)

1. When the header is absent, the controller must return `402 Payment Required` with an `accepts` array describing available methods.
2. `buildAccepts` is responsible for composing this array:
   - **Crypto accept:** Always available unless the job is already locked to fiat. It mirrors the x402 requirements (scheme, network, payTo, amount).
   - **Fiat accept:** Built opportunistically by `tryFiatAccept`.
3. `tryFiatAccept` steps:
   - Resolve `fiatAmount` (defaults to `amountUsd`).
   - Derive a glosa seed using `dto.description ?? dto.orderId`, sanitize it via `normalizeDetails` (uppercase `A-Z0-9`, min length 3).
   - Invoke `FiatAutomationService.generateQrWithTimeout` (30s). This queues a Playwright job that downloads the QR PNG, converts it to Base64, and caches it on the job object.
   - On success, return a fiat accept entry containing `currency`, `symbol`, `amountRequired`, and `base64QrSimple` (used by clients to display the QR instantly).
   - On timeout or error, log a warning and omit the fiat option. The crypto option still allows payment completion.
4. The 402 JSON payload structure:
   ```json
   {
     "x402Version": 1,
     "resource": "Product",
     "accepts": [
       {
         /* crypto option */
       },
       {
         /* optional fiat option */
       }
     ],
     "error": "X-PAYMENT header is required",
     "jobId": "x402_..."
   }
   ```

## 4. Fiat Path (`X-PAYMENT` contains `{ type: "fiat", ... }`)

1. The header is decoded with `decodePaymentHeader`. `isFiatPaymentPayload` identifies the fiat variant.
2. Guard rails:
   - If the job is already locked to crypto, immediately return `402` with `error: "Payment method already locked to crypto"` and refreshed `accepts`.
   - Otherwise the job locks to fiat for the remainder of its lifecycle.
3. Derive `details` = sanitized value of `payload.glosa || dto.description || dto.orderId`. Sanitization uses `normalizeDetails`, stripping punctuation/whitespace and forcing uppercase alphanumerics.
4. `FiatAutomationService.verifyPaymentInline` enqueues a sequential Playwright job that inspects the latest Ecofuturo movement and checks whether the glosa contains both `"BM QR"` and the sanitized `details`. Timeout: 30 seconds.
5. Build the settlement response:
   ```json
   {
     "success": true|false,
     "type": "fiat",
     "transaction": payload.transactionId || payload.time || null,
     "currency": payload.currency || dto.currency || "BOB",
     "errorReason": success ? null : "Fiat payment could not be verified"
   }
   ```
6. Serialize the settlement into the `X-PAYMENT-RESPONSE` header (via `encodeSettlementHeader`) and mirror the object in the JSON body.
7. On failure, respond with `402 Payment Required`, keep the job marked as fiat, stash the error message on the job, and include whichever accept options remain (crypto is suppressed because fiat is now locked in).
8. On success, mark the job as `completed`, set `updatedAt`, and send `200 OK`.

## 5. Crypto Path (`X-PAYMENT` contains `{ type: "crypto", ... }`)

1. `X402PaymentService.processPayment` performs the heavy lifting:
   - Rejects expired jobs and jobs already locked to fiat.
   - Decodes the payload and ensures it is crypto-specific.
   - Stores the payload, marks `paymentMethod = 'crypto'`, and schedules `verifyAndSettle` on `X402JobQueueService` to maintain sequential processing.
2. `verifyAndSettle` workflow:
   - **Verify:** `X402FacilitatorService.verify` validates the EIP-712 signature and USDC authorization values.
   - **Settle:** If verification succeeds, `settle` executes `transferWithAuthorization`, paying gas from the facilitator wallet.
   - **Manual confirmation:** When `requiresManualConfirmation = true`, the job stops at `settled` status. External tooling must call the confirmation workflow (not exposed publicly) before it transitions to `completed`.
   - **Webhooks:** Each milestone (`...REQUIRED`, `...VERIFIED`, `...SETTLED`, `...CONFIRMED`, `...FAILED`, `...EXPIRED`) is emitted through `X402WebhookService` to `${OPTUSBMS_BACKEND_URL}/webhook/x402/result`.
3. Controller response semantics:
   - Always set `X-PAYMENT-RESPONSE` with `{ success, type: 'crypto', transaction, network, chainId, payer, errorReason }`.
   - On settlement failure, rebuild `accepts` and return `402` so the client can retry; otherwise respond `200 OK` with the settlement JSON.

## 6. Shared Behaviors & Timeouts

- **Job locking:** Only one method (fiat or crypto) may complete per `orderId`. Once a method is locked, the other path returns `402` with a descriptive error.
- **Fiat automation queue:** `JobQueueService` serializes all Playwright actions. `generateQrWithTimeout` and `verifyPaymentInline` reuse the same queue to avoid concurrent browser usage.
- **Glosa normalization:** Every fiat-related entry point calls `normalizeDetails` to ensure strings are uppercase `A-Z0-9`. Inputs producing fewer than 3 valid characters are rejected before hitting Ecofuturo.
- **Header casing:** Incoming code treats `X-PAYMENT` case-insensitively, but outgoing `X-PAYMENT-RESPONSE` always uses uppercase for clarity.
- **Timeouts:**
  - QR generation attempts are capped at 30 seconds.
  - Inline verification is capped at 30 seconds.
  - Payment jobs expire after `X402_PAYMENT_TIMEOUT_MS` (default 5 minutes). Expired jobs emit `X402_PAYMENT_EXPIRED` and reject new payloads with `status: 'expired'`.

## 7. Observability Hooks

- `WebhookService.sendQrGenerated` and `sendVerificationResult` inform upstream systems about fiat-side progress (QR availability and verification success/failure).
- `X402WebhookService` provides lifecycle updates for crypto jobs.
- The controller echoes errors in JSON bodies _and_ in `X-PAYMENT-RESPONSE.errorReason`, ensuring clients parsing either channel can act accordingly.

### Quick Reference Checklist for Modifying `/api/pay`

1. **Additions to Accepts:** Update both the JSON body and the cached job state so retries behave consistently.
2. **Settlement Schema Changes:** Reflect updates in both the header encoder (`encodeSettlementHeader`) and any JSON bodies.
3. **Timeout Tweaks:** Keep `fiatTimeoutMs` (controller) and `X402_PAYMENT_TIMEOUT_MS` (service/env) aligned with operational limits.
4. **Data Sanitization:** Any new string that feeds Ecofuturo must go through `normalizeDetails` before queuing Playwright work.
5. **Webhooks:** When introducing new statuses or failure modes, ensure both fiat and x402 webhook services emit meaningful payloads so orchestration layers remain informed.
