import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppMessagingService } from '../messaging/features/whatsapp/services/whatsapp.messaging.service';

@Injectable()
export class PaymentWorkflowService {
  private readonly logger = new Logger(PaymentWorkflowService.name);

  constructor(private readonly whatsappMessaging: WhatsAppMessagingService) {}
}
