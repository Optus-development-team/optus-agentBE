import { Injectable, Logger } from '@nestjs/common';
import type { WhatsAppInteractiveButton } from '../interfaces/whatsapp-messaging.interface';
import { WhatsAppMessagingService } from './whatsapp.messaging.service';
import { CompanyStickerService } from './company-sticker.service';
import type { StickerEventKey } from '../types/sticker-events.types';

interface ResponseOptions {
  phoneNumberId?: string;
  replyToMessageId?: string;
  companyId?: string;
}

@Injectable()
export class WhatsAppResponseService {
  private readonly logger = new Logger(WhatsAppResponseService.name);

  constructor(
    private readonly messaging: WhatsAppMessagingService,
    private readonly stickers: CompanyStickerService,
  ) {}

  async sendSmartText(
    to: string,
    text: string,
    options: ResponseOptions = {},
  ): Promise<void> {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return;
    }

    const extractedUrl = this.extractFirstUrl(normalizedText);

    if (extractedUrl) {
      await this.sendCtaLink(
        to,
        {
          bodyText: normalizedText.replace(this.urlRegex(), '').trim(),
          buttonDisplayText: 'Abrir enlace',
          buttonUrl: extractedUrl,
        },
        options,
      );
    } else if (this.isConfirmationPrompt(normalizedText)) {
      const buttons = this.buildConfirmationButtons(normalizedText);
      await this.messaging.sendInteractiveButtons(to, normalizedText, buttons, {
        phoneNumberId: options.phoneNumberId,
        replyToMessageId: options.replyToMessageId,
        companyId: options.companyId,
      });
    } else {
      await this.messaging.sendText(to, normalizedText, {
        phoneNumberId: options.phoneNumberId,
        replyToMessageId: options.replyToMessageId,
        companyId: options.companyId,
      });
    }

    const event = this.inferEventFromText(normalizedText);
    if (event) {
      await this.sendStickerForEvent(to, event, options);
    }
  }

  async sendCtaLink(
    to: string,
    params: {
      bodyText: string;
      buttonDisplayText: string;
      buttonUrl: string;
      footerText?: string;
    },
    options: ResponseOptions = {},
  ): Promise<void> {
    await this.messaging.sendInteractiveCtaUrl(
      to,
      {
        bodyText: params.bodyText || 'Abre el enlace para continuar.',
        buttonDisplayText: params.buttonDisplayText,
        buttonUrl: params.buttonUrl,
        footerText: params.footerText,
      },
      {
        phoneNumberId: options.phoneNumberId,
        replyToMessageId: options.replyToMessageId,
        companyId: options.companyId,
      },
    );
  }

  async sendStickerForEvent(
    to: string,
    event: StickerEventKey,
    options: ResponseOptions = {},
  ): Promise<void> {
    try {
      const stickerUrl = await this.stickers.getStickerUrl(options.companyId, event);
      await this.messaging.sendSticker(
        to,
        {
          link: stickerUrl,
        },
        {
          phoneNumberId: options.phoneNumberId,
          replyToMessageId: options.replyToMessageId,
          companyId: options.companyId,
        },
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo enviar sticker ${event}: ${(error as Error).message}`,
      );
    }
  }

  private isConfirmationPrompt(text: string): boolean {
    const normalized = text.toLowerCase();
    return (
      /\b(si|sí|no)\b/.test(normalized) ||
      /confirm(ar|as|a)|rechaz(ar|as|a)|aprobar|declinar/.test(normalized)
    );
  }

  private buildConfirmationButtons(text: string): WhatsAppInteractiveButton[] {
    const normalized = text.toLowerCase();

    if (/rechaz|declin/.test(normalized)) {
      return [
        { type: 'reply', reply: { id: 'confirm_action', title: 'Confirmar' } },
        { type: 'reply', reply: { id: 'reject_action', title: 'Rechazar' } },
      ];
    }

    return [
      { type: 'reply', reply: { id: 'confirm_yes', title: 'Sí' } },
      { type: 'reply', reply: { id: 'confirm_no', title: 'No' } },
    ];
  }

  private inferEventFromText(text: string): StickerEventKey | undefined {
    const normalized = text.toLowerCase();

    if (/google|autenticaci[oó]n|login/.test(normalized) && /exitosa|completad|correct/.test(normalized)) {
      return 'google_login_success';
    }
    if (/cita/.test(normalized) && /agendad/.test(normalized)) {
      return 'appointment_scheduled';
    }
    if (/cita/.test(normalized) && /confirmad/.test(normalized)) {
      return 'appointment_confirmed';
    }
    if (/cita/.test(normalized) && /cancelad/.test(normalized)) {
      return 'appointment_cancelled';
    }
    if (/cita/.test(normalized) && /reprogramad/.test(normalized)) {
      return 'appointment_rescheduled';
    }
    if (/recordatorio/.test(normalized) && /cita/.test(normalized)) {
      return 'appointment_reminder';
    }
    if (/pedido/.test(normalized) && /recibid/.test(normalized)) {
      return 'order_b2c_received';
    }
    if (/pedido/.test(normalized) && /preparaci[oó]n/.test(normalized)) {
      return 'order_b2c_preparing';
    }
    if (/pedido/.test(normalized) && /enviado/.test(normalized)) {
      return 'order_b2c_sent';
    }
    if (/pedido/.test(normalized) && /entregad/.test(normalized)) {
      return 'order_b2c_delivered';
    }
    if (/pago/.test(normalized) && /fallid|rechazad/.test(normalized)) {
      return 'payment_failed_or_rejected';
    }
    if (/pago/.test(normalized) && /recibid|confirmad|acreditad/.test(normalized)) {
      return 'client_payment_received';
    }
    if (/reporte/.test(normalized) && /ia|generad/.test(normalized)) {
      return 'ai_report_generated';
    }
    if (/producto/.test(normalized) && /cat[aá]logo|agregad/.test(normalized)) {
      return 'catalog_new_product_added';
    }
    if (/cancelad/.test(normalized) && /usuario/.test(normalized)) {
      return 'user_action_cancelled';
    }
    if (/error|no autorizad|denegad|fall[oó]/.test(normalized)) {
      return 'error_or_unauthorized_action';
    }

    return undefined;
  }

  private extractFirstUrl(text: string): string | null {
    const match = text.match(this.urlRegex());
    return match?.[0] ?? null;
  }

  private urlRegex(): RegExp {
    return /https?:\/\/[^\s]+/i;
  }
}
