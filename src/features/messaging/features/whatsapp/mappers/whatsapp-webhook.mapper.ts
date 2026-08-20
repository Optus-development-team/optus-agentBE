import type { WhatsAppWebhook } from '../dto/whatsapp-webhook.dto';

type WhatsAppIncomingPayload = NonNullable<
  WhatsAppWebhook['entry'][number]['changes'][number]['value']['messages']
>[number];

export interface IncomingWhatsAppWebhookContext {
  message: WhatsAppIncomingPayload;
  phoneNumberId: string;
  contactProfileName: string;
}

export function mapWhatsAppWebhookToIncomingContext(
  webhookData: WhatsAppWebhook,
): IncomingWhatsAppWebhookContext | null {
  const entry = webhookData.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];

  if (!entry || !change || !value || !message) {
    return null;
  }

  return {
    message,
    phoneNumberId: value.metadata.phone_number_id,
    contactProfileName: value.contacts?.[0]?.profile.name ?? '',
  };
}
