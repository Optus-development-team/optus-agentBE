# Servicio SSE de Notificaciones

## Objetivo
El endpoint `GET /v1/notifications/stream` expone eventos en tiempo real para el dashboard frontend (Vite), filtrados estrictamente por `companyId` del usuario autenticado.

## Flujo
1. El usuario completa OAuth en `GET /v1/auth/google/callback`.
2. Backend setea cookie segura `optus_auth` con JWT (payload: `userId`, `companyId`, `role`, `email`, `issuedAt`, `expiresAt`).
3. Frontend abre conexión SSE contra `GET /v1/notifications/stream` enviando la cookie.
4. `CookieJwtAuthGuard` valida token leyendo **solo cookies** (no usa Authorization header).
5. `NotificationsService` se suscribe al bus interno `system.notification`.
6. Se emiten al cliente únicamente eventos cuyo `event.companyId` coincide con la empresa del token.

## Seguridad aplicada
- Cookie con flags: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
- Guard que bloquea si la cookie no existe, firma inválida o token expirado.
- Filtrado server-side por `companyId` obligatorio en todos los eventos.

## Contrato del evento interno
Todos los módulos deben emitir este formato:

```json
{
  "companyId": "uuid-company",
  "type": "event.name",
  "timestamp": "2026-03-04T15:33:00.000Z",
  "payload": {
    "...": "..."
  }
}
```

## Eventos implementados
- `whatsapp.webhook.received`
  - Emitido al recibir mensaje entrante WhatsApp, luego de resolver tenant.
- `webhook.bank.accepted`
  - Emitido en `webhooks/bank-provider` al aceptar `QR_GENERATED` con `companyId` resuelto.
- `whatsapp.message.marked_as_read`
  - Emitido tras marcar mensaje como leído en API Meta.
- `whatsapp.typing_indicator.enabled`
  - Emitido cuando se activa typing indicator en el flujo.
- `whatsapp.response.sent`
  - Emitido cuando Meta confirma envío de respuesta saliente.
- `orchestrator.tenant.resolved`
  - Emitido al resolver vertical/rol/tenant en orquestador.
- `orchestrator.response.generated`
  - Emitido al finalizar la respuesta de orquestación.
- `agent.tool.triggered`
  - Emitido cada vez que una tool instrumentada se ejecuta.
- `sales.order.registered`
  - Emitido al registrar orden desde tool de ventas.
- `appointment.created`
  - Emitido al confirmar creación de evento en Google Calendar desde tool de citas.

## Consumo frontend (Vite) ejemplo
```ts
const source = new EventSource('/v1/notifications/stream', { withCredentials: true });

source.addEventListener('whatsapp.response.sent', (event) => {
  const data = JSON.parse(event.data);
  console.log('Respuesta enviada', data);
});

source.onerror = () => {
  source.close();
};
```

## Eventos sugeridos a futuro
- `payment.qr.generated`
- `payment.confirmed`
- `inventory.synced`
- `appointment.cancelled`
- `appointment.rescheduled`
- `report.generated`
- `webhook.whatsapp.validation_failed`
- `auth.session.expiring`
- `auth.session.revoked`
- `tenant.configuration.updated`

## Recomendaciones operativas
- Mantener payloads pequeños y serializables en JSON.
- Evitar emitir eventos sin `companyId`.
- Usar nombres de evento estables (`kebab/snake/dot`) para versionado de frontend.
- Instrumentar retry/backoff en frontend para reconectar SSE.
