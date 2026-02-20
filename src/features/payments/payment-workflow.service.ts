import { Injectable, Logger } from '@nestjs/common';
import { PaymentIntegrationService } from './payment-integration.service';
import { WhatsAppMessagingService } from '../whatsapp/services/whatsapp.messaging.service';

@Injectable()
export class PaymentWorkflowService {
  private readonly logger = new Logger(PaymentWorkflowService.name);

  constructor(
    private readonly payments: PaymentIntegrationService,
    private readonly messaging: WhatsAppMessagingService,
  ) {}

  async createPaymentLink(params: {
    senderPhone: string;
    orderId: string;
    amountUsd: number;
    description?: string;
  }): Promise<void> {
    try {
      const negotiation = await this.payments.negotiatePayment({
        orderId: params.orderId,
        amountUsd: params.amountUsd,
        description: params.description,
      });

      await this.messaging.sendText(
        params.senderPhone,
        negotiation.qrBase64
          ? 'Generamos tu enlace y QR de pago, revisa la imagen o el link provisto.'
          : 'Generamos tu enlace de pago. Confirma si necesitas el QR.',
      );
    } catch (error) {
      this.logger.error(
        `No se pudo generar link de pago ${params.orderId}: ${(error as Error).message}`,
      );
      await this.messaging.sendText(
        params.senderPhone,
        'No pudimos generar el link de pago. Intenta de nuevo en unos minutos.',
      );
    }
  }

  async verifyProofPlaceholder(params: { senderPhone: string }): Promise<void> {
    await this.messaging.sendText(
      params.senderPhone,
      'Recibimos tu comprobante. Validaremos la transacción y te avisaremos.',
    );
  }

  async choosePayoutPlaceholder(params: {
    senderPhone: string;
    method: 'FIAT' | 'USDC' | 'LATER';
  }): Promise<void> {
    await this.messaging.sendText(
      params.senderPhone,
      `Seleccionaste ${params.method}. Procesaremos tu pago y te notificaremos cuando esté listo.`,
    );
  }

  async sendUserInfoPlaceholder(to: string): Promise<void> {
    await this.messaging.sendText(
      to,
      'Consultaremos tu información financiera y te la enviaremos pronto.',
    );
  }
}
