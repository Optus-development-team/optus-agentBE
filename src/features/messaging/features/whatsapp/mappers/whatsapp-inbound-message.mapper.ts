import { WhatsAppInboundMessage } from '../classes/whatsapp-inbound.message';
import { WhatsAppMessagingService } from '../services/whatsapp.messaging.service';
import type { TenantContext, UserRole } from '../types/whatsapp.types';
import type { IncomingWhatsAppWebhookContext } from './whatsapp-webhook.mapper';

export function createWhatsAppInboundMessage(
  context: IncomingWhatsAppWebhookContext,
  tenant: TenantContext,
  role: UserRole,
  messagingService: WhatsAppMessagingService,
): WhatsAppInboundMessage {
  return new WhatsAppInboundMessage(
    context.message,
    context.phoneNumberId,
    context.contactProfileName,
    tenant,
    role,
    messagingService,
  );
}
