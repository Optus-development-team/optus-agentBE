export const SYSTEM_EVENT_CHANNEL = 'system.notification';

export enum SystemEventType {
  WHATSAPP_WEBHOOK_RECEIVED = 'whatsapp.webhook.received',
  BANK_WEBHOOK_ACCEPTED = 'webhook.bank.accepted',
  WHATSAPP_MESSAGE_MARKED_AS_READ = 'whatsapp.message.marked_as_read',
  WHATSAPP_TYPING_INDICATOR = 'whatsapp.typing_indicator.enabled',
  WHATSAPP_RESPONSE_SENT = 'whatsapp.response.sent',
  TENANT_RESOLVED = 'orchestrator.tenant.resolved',
  LLM_RESPONSE_GENERATED = 'orchestrator.response.generated',
  TOOL_ACTION_TRIGGERED = 'agent.tool.triggered',
  SALES_ORDER_REGISTERED = 'sales.order.registered',
  APPOINTMENT_CREATED = 'appointment.created',
}

export interface SystemNotificationEvent<TPayload = Record<string, unknown>> {
  companyId: string;
  type: SystemEventType | string;
  timestamp: string;
  payload: TPayload;
}
