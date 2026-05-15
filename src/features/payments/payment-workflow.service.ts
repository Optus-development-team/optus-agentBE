import { Injectable, Logger } from '@nestjs/common';
import { PaymentIntegrationService } from './payment-integration.service';
import { WhatsAppMessagingService } from '../messaging/features/whatsapp/services/whatsapp.messaging.service';

@Injectable()
export class PaymentWorkflowService {
  private readonly logger = new Logger(PaymentWorkflowService.name);

  constructor(
    private readonly payments: PaymentIntegrationService,
    private readonly whatsappMessaging: WhatsAppMessagingService,
  ) {}

  // marked for modification
  async createPaymentLink(params: {
    senderPhone: string;
    orderId: string;
    amountUsd: number;
    description?: string;
    companyId?: string;
    phoneNumberId?: string;
  }): Promise<void> {
    try {
      const negotiation = await this.payments.negotiatePayment({
        orderId: params.orderId,
        amountUsd: params.amountUsd,
        description: params.description,
      });

      const paymentUrl = this.extractFirstUrl(negotiation.raw);

      if (paymentUrl) {
        await this.whatsappMessaging.sendInteractiveCtaUrl(
          params.senderPhone,
          {
            bodyText:
              'Generamos tu enlace de pago. Presiona el botón para abrirlo.',
            buttonDisplayText: 'Pagar ahora',
            buttonUrl: paymentUrl,
          },
          {
            companyId: params.companyId,
            phoneNumberId: params.phoneNumberId,
          },
        );
      } else {
        await this.whatsappMessaging.sendText(
          params.senderPhone,
          negotiation.qrBase64
            ? 'Generamos tu enlace y QR de pago, revisa la imagen o el link provisto.'
            : 'Generamos tu enlace de pago. Confirma si necesitas el QR.',
          {
            companyId: params.companyId,
            phoneNumberId: params.phoneNumberId,
          },
        );
      }

      await this.whatsappMessaging.sendStickerForEvent(
        params.senderPhone,
        'supplier_payment_started',
        {
          companyId: params.companyId,
          phoneNumberId: params.phoneNumberId,
        },
      );
    } catch (error) {
      this.logger.error(
        `No se pudo generar link de pago ${params.orderId}: ${(error as Error).message}`,
      );
      await this.whatsappMessaging.sendText(
        params.senderPhone,
        'No pudimos generar el link de pago. Intenta de nuevo en unos minutos.',
        {
          companyId: params.companyId,
          phoneNumberId: params.phoneNumberId,
        },
      );
      await this.whatsappMessaging.sendStickerForEvent(
        params.senderPhone,
        'payment_failed_or_rejected',
        {
          companyId: params.companyId,
          phoneNumberId: params.phoneNumberId,
        },
      );
    }
  }

  //marked for deletion
  async verifyProofPlaceholder(params: {
    senderPhone: string;
    companyId?: string;
    phoneNumberId?: string;
  }): Promise<void> {
    await this.whatsappMessaging.sendText(
      params.senderPhone,
      'Recibimos tu comprobante. Validaremos la transacción y te avisaremos.',
      {
        companyId: params.companyId,
        phoneNumberId: params.phoneNumberId,
      },
    );
    await this.whatsappMessaging.sendStickerForEvent(
      params.senderPhone,
      'client_payment_received',
      {
        companyId: params.companyId,
        phoneNumberId: params.phoneNumberId,
      },
    );
  }

  //marked for deletion
  async choosePayoutPlaceholder(params: {
    senderPhone: string;
    method: 'FIAT' | 'USDC' | 'LATER';
    companyId?: string;
    phoneNumberId?: string;
  }): Promise<void> {
    await this.whatsappMessaging.sendText(
      params.senderPhone,
      `Seleccionaste ${params.method}. Procesaremos tu pago y te notificaremos cuando esté listo.`,
      {
        companyId: params.companyId,
        phoneNumberId: params.phoneNumberId,
      },
    );
    await this.whatsappMessaging.sendStickerForEvent(
      params.senderPhone,
      'processing_ai_thinking',
      {
        companyId: params.companyId,
        phoneNumberId: params.phoneNumberId,
      },
    );
  }

  //marked for deletion
  async sendUserInfoPlaceholder(params: {
    to: string;
    companyId?: string;
    phoneNumberId?: string;
  }): Promise<void> {
    await this.whatsappMessaging.sendText(
      params.to,
      'Consultaremos tu información financiera y te la enviaremos pronto.',
      {
        companyId: params.companyId,
        phoneNumberId: params.phoneNumberId,
      },
    );
  }

  //marked for deletion
  private extractFirstUrl(source: unknown): string | null {
    const urlRegex = /https?:\/\/[^\s"']+/i;

    if (typeof source === 'string') {
      const match = source.match(urlRegex);
      return match?.[0] ?? null;
    }

    if (Array.isArray(source)) {
      for (const item of source) {
        const found = this.extractFirstUrl(item);
        if (found) {
          return found;
        }
      }
      return null;
    }

    if (source && typeof source === 'object') {
      for (const value of Object.values(source as Record<string, unknown>)) {
        const found = this.extractFirstUrl(value);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }
}
