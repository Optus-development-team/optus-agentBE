import { WhatsAppMessageBurst } from '../classes/whatsapp-message-burst';

export interface PendingBurst {
  burst: WhatsAppMessageBurst;
  timeout: NodeJS.Timeout;
}