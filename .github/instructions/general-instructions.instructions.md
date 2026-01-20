# SYSTEM CONTEXT: OPTUSBMS_BACKEND (Multi-Tenant SaaS Core)

## 1. System Overview

**Role:** Central Multi-Tenant Orchestration Server ("The Brain"). Serves multiple companies simultaneously using a single codebase.
**Tech Stack:** - **Framework:** NestJS (Node.js)

- **AI/Agents:** Google ADK (Generative AI) - _Beta Typescript implementation_
- **Database:** **Supabase** (PostgreSQL)
- **Queue:** BullMQ (Redis)
- **External APIs:** Google Calendar API, WhatsApp Cloud API.

**Tech Stack Documentation:**

- [NestJS](https://docs.nestjs.com/)
- [Google ADK - Sessions](https://google.github.io/adk-docs/sessions/session/)
- [Supabase Docs](https://supabase.com/docs)
- [Prisma with Supabase](https://supabase.com/docs/guides/database/connecting/prisma)

**Architecture Pattern:** Mixture of Experts (MoE) orchestrated by a central Router.
**Data Strategy:** Shared Database with Logical Isolation (Multi-tenancy via `company_id`).
**Response Language:** Spanish (The bot talks to users in Spanish).

## 2. Infrastructure: Database & Connection Strategy (Supabase)

**Objective:** Manage persistent data and AI vector memory efficiently.

- **Connection Pooling (CRITICAL):**
  - Since NestJS (via Prisma/TypeORM) maintains persistent connections, you MUST use the **Supabase Transaction Pooler** (Supavisor) on port `6543`.
  - _Why:_ To prevent exhausting the database connection limit in high-concurrency scenarios (multiple WhatsApp webhooks).
  - _Connection String Mode:_ `pgbouncer=true` or `?pgbouncer=true`.
- **Vector Support:** The database has the `pgvector` extension enabled for future semantic search capabilities by the Agents (`company_users.embedding`).

## 3. Context Resolution (Multi-Tenancy)

**Principle:** Every incoming request is "Stateless" until resolved to a specific Company.

1.  **Input:** Webhook from WhatsApp Cloud API.
2.  **Identifier:** Extract `metadata.phone_number_id` (The business phone number ID receiving the message).
3.  **Resolution Logic:**
    - Query `public.companies` table: `SELECT id, name, config FROM companies WHERE whatsapp_phone_id = ?`.
    - **Result:** Obtain `current_company_id`.
    - _Exception:_ If Phone ID is unknown, ignore request (Security by Obscurity).
4.  **Injection:** Inject `current_company_id` into the Request Scope (NestJS Request Context) for all downstream Agents.

## 4. Google ADK Session Management

**Objective:** Maintain conversation state, history, and context per user/company pair using Google ADK Sessions (Beta).

- **Session ID Strategy:** Composite Key -> `${current_company_id}:${sender_phone}`.
- **Initialization:**
  - Use `adk.Session(id: string, context: map)`.
- **Context Injection (The "System Prompt" Data):**
  When initializing or retrieving a session, you MUST inject the specific Company Context derived from Supabase `companies.config`:
  ```json
  {
    "company_name": "Empresa A",
    "company_tone": "Formal",
    "user_role": "CLIENT", // or ADMIN
    "inventory_context": "Clothing Store",
    "today_date": "YYYY-MM-DD"
  }
  ```
- **Persistence:** The ADK Session state is stored in the `adk_sessions` table (JSONB `context_data`).
  - _Load:_ On inbound message, fetch JSONB from DB -> Hydrate ADK Session.
  - _Save:_ After agent reply, serialize ADK Session -> Update DB.

## 5. Security & Identity (RBAC)

**Objective:** Determine if the user is a Customer or the Owner.

- **Identity Source:** WhatsApp `sender_id` (User's Phone Number).
- **Role Assignment (Dynamic per Tenant):**
  - Query `public.company_users` table where `company_id = current_company_id` AND `phone = sender_id`.
  - **`ROLE_ADMIN`:** If user is flagged as owner/admin in DB.
  - **`ROLE_CLIENT`:** Default role if no match found.

## 6. The Orchestrator (Router Agent)

**Objective:** Analyze intent within the specific Company Context provided by the ADK Session.

| Intent             | Target Agent      | Required Role  | Notes                               |
| :----------------- | :---------------- | :------------- | :---------------------------------- |
| `INTENT_BOOKING`   | Appointment Agent | CLIENT / ADMIN | Scheduling within Company Calendar. |
| `INTENT_SHOPPING`  | Sales Agent       | CLIENT / ADMIN | Company Catalog interactions.       |
| `INTENT_REPORTING` | Reporting Agent   | **ADMIN ONLY** | Company Stats.                      |
| `INTENT_2FA_REPLY` | Sales Agent (Sec) | **ADMIN ONLY** | Providing bank tokens manually.     |

## 7. Sub-Agents Specifications

### A. Appointment Agent (`agente_citas`)

- **Data Isolation:** Always append `WHERE company_id = ?` to Supabase queries.
- **Auth Strategy:** See Section 8 (Google OAuth2).

### B. Sales Agent (`agente_venta`)

- **Inventory Source:** Supabase Table `public.products` (Scoped by `company_id`).
- **Payment State Machine:** Tracks `OrderState` (CART -> AWAITING_QR -> QR_SENT -> VERIFYING -> COMPLETED).
- **Reference Logic:** Generates a unique shortcode for `orders.details` (e.g., `REF-A1B2`) which acts as the 'Glosa' for bank reconciliation.

### C. Reporting Agent

- **Context:** Only access data belonging to `current_company_id`.
- **Tools:** Use Supabase Aggregation queries (`SUM`, `COUNT`) to generate reports.

## 8. Google Calendar OAuth2 Strategy (Multi-Tenant Backend Flow)

**Objective:** Obtain offline access to Google Calendar for each company without a Frontend Dashboard.

### 8.1 Data Structure

- **Table:** `company_integrations`
- **Filter:** `provider = 'GOOGLE_CALENDAR'` AND `company_id = current_company_id`
- **Stored Data:** Encrypted JSONB containing `{ refresh_token, access_token, expiry_date }`.

### 8.2 Onboarding Flow (The "Link" Strategy)

1.  **Trigger:** Admin sends message "Conectar Calendario" to the Bot.
2.  **Action:** Agent generates a Google OAuth2 authorization URL via `google-auth-library`.
    - _Scopes:_ `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/calendar.events`
    - _Access Type:_ `offline` (Mandatory for Refresh Token).
    - _State Param:_ Encoded JSON `{ company_id: "...", admin_phone: "..." }` to track origin.
    - _Redirect URI:_ `https://api.optusbms.com/auth/google/callback`.
3.  **User Experience:** Bot sends link -> Admin clicks -> Google Consent Screen -> Redirects to Backend.
4.  **Callback Handler (`GET /auth/google/callback`):**
    - Decode `state` param to identify the Tenant.
    - Exchange `code` for tokens.
    - **Encryption:** Encrypt tokens (AES-256).
    - **Upsert:** Update `company_integrations` table.
    - **Response:** Serve simple HTML: "Conexión Exitosa. Vuelve a WhatsApp."
    - **Notification:** Bot sends message: "✅ Calendario conectado exitosamente."

### 8.3 Operational Flow (Sync)

1.  **Load:** Fetch encrypted credentials from DB.
2.  **Hydrate:** Initialize `OAuth2Client`. Set credentials.
3.  **Refresh:** If token expired, library auto-refreshes using `refresh_token`.
4.  **Execute:** Call Calendar API.

## 9. Integration with Payment Microservice (`bms_payment_backend`)

The Agent must instruct the Payment Backend _which_ company's bank credentials to use by passing the `company_id`.

### Outbound Call: Generate QR

- **Endpoint:** `POST /v1/fiat/generate-qr`
- **Payload:**
  ```json
  {
    "company_id": "uuid-company-A", // Payment Worker uses this to fetch encrypted bank creds
    "order_id": "uuid-order-123",
    "amount": 100.5,
    "details": "REF-ABC"
  }
  ```

### 2FA Handling (Human-in-the-Loop)

- **Event:** `LOGIN_2FA_REQUIRED` Webhook received.
- **Logic:**
  1.  Extract `company_id` from payload.
  2.  Find the `ROLE_ADMIN` phone number for _that specific Company_ in Supabase.
  3.  Update `company_integrations.needs_2fa_attention = true`.
  4.  Send WhatsApp Alert: "⚠️ [Empresa X] El banco pide Token. Responde aquí."
  5.  Admin replies "123456" -> Agent calls `POST /v1/fiat/set-2fa`.

## 10. Inventory Strategy (Hybrid Sync)

**Objective:** Allow Owner to use WhatsApp App as CMS, but keep Supabase as Master.

- **Master:** Supabase Database (`stock_quantity`).
- **Updates:**
  - **Sales:** Decrement stock in Supabase immediately via Transaction.
  - **Admin Edits:** Listen to WhatsApp Webhooks (`catalog_item_updated`).
    - **Check:** Verify webhook comes from the WABA ID associated with `company_id`.
    - **Action:** Update `public.products` table for the specific `company_id` with new price/image.

## 11. Error Handling

- **Payment Timeout:** If `VERIFICATION_RESULT` takes > 60s, Agent must inform user: _"El banco demora un poco. Te avisaré apenas confirme."_ and schedule a delayed check.
- **Context Failure:** If `company_id` cannot be resolved from the phone number, drop the message silently.
