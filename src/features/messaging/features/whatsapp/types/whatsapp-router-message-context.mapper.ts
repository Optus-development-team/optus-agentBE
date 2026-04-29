import type { RouterMessageContext } from './whatsapp.types';
import type { WhatsAppMessageBurst } from '../classes/whatsapp-message-burst';

export function mapBurstToRouterMessageContext(
  burst: WhatsAppMessageBurst,
): RouterMessageContext {
  const inboundMsg = burst.baseMessage;

  return {
    senderId: inboundMsg.senderId,
    senderName: inboundMsg.senderName,
    whatsappMessageId: inboundMsg.id,
    originalText: burst.aggregatedText,
    message: inboundMsg.rawPayload,
    phoneNumberId: inboundMsg.recipientId,
    tenant: inboundMsg.tenant,
    role: inboundMsg.role,
  };
}