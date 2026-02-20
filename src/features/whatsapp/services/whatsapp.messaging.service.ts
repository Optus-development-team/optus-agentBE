import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import {
  WhatsAppMessageResponse,
  WhatsAppTemplateComponent,
  WhatsAppInteractiveButton,
  WhatsAppInteractiveListSection,
  WhatsAppLocation,
  MessageContextOptions,
  MediaOptions,
  DocumentOptions,
  InteractiveOptions,
  PaymentRequestParams,
  UploadMediaOptions,
  WhatsAppSticker,
  StickerOptions,
} from '../interfaces/whatsapp-messaging.interface';

/**
 * Servicio para enviar diferentes tipos de mensajes de WhatsApp.
 * Implementa la API de WhatsApp Cloud según la documentación oficial.
 */
@Injectable()
export class WhatsAppMessagingService {
  private readonly logger = new Logger(WhatsAppMessagingService.name);
  private readonly apiVersion: string;
  private readonly apiToken: string;
  private readonly defaultPhoneNumberId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v21.0');
    this.apiToken = this.config.get<string>('META_API_TOKEN', '');
    this.defaultPhoneNumberId =
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID', '') ||
      this.config.get<string>('PHONE_NUMBER_ID', '');
  }

  /**
   * Construye la URL base para la API de WhatsApp
   */
  private getApiUrl(phoneNumberId?: string): string {
    const id = phoneNumberId || this.defaultPhoneNumberId;
    return `https://graph.facebook.com/${this.apiVersion}/${id}/messages`;
  }

  private getMediaUrl(phoneNumberId?: string): string {
    const id = phoneNumberId || this.defaultPhoneNumberId;
    return `https://graph.facebook.com/${this.apiVersion}/${id}/media`;
  }

  /**
   * Headers comunes para las peticiones
   */
  private getHeaders() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  // =========================================================================
  // MENSAJE DE TEXTO
  // =========================================================================
  async sendText(
    to: string,
    text: string,
    options?: {
      phoneNumberId?: string;
      previewUrl?: boolean;
      replyToMessageId?: string;
    },
  ): Promise<WhatsAppMessageResponse> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        body: text,
        preview_url: options?.previewUrl ?? false,
      },
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  // =========================================================================
  // MENSAJES MULTIMEDIA
  // =========================================================================
  async sendImage(
    to: string,
    image: { id?: string; link?: string },
    options?: MediaOptions,
  ): Promise<WhatsAppMessageResponse> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        ...(image.id ? { id: image.id } : {}),
        ...(image.link ? { link: image.link } : {}),
        ...(options?.caption ? { caption: options.caption } : {}),
      },
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  async sendVideo(
    to: string,
    video: { id?: string; link?: string },
    options?: MediaOptions,
  ): Promise<WhatsAppMessageResponse> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'video',
      video: {
        ...(video.id ? { id: video.id } : {}),
        ...(video.link ? { link: video.link } : {}),
        ...(options?.caption ? { caption: options.caption } : {}),
      },
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  async sendDocument(
    to: string,
    document: { id?: string; link?: string },
    options?: DocumentOptions,
  ): Promise<WhatsAppMessageResponse> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      document: {
        ...(document.id ? { id: document.id } : {}),
        ...(document.link ? { link: document.link } : {}),
        ...(options?.caption ? { caption: options.caption } : {}),
        ...(options?.filename ? { filename: options.filename } : {}),
      },
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  // =========================================================================
  // STICKERS
  // =========================================================================
  async sendSticker(
    to: string,
    sticker: WhatsAppSticker,
    options?: StickerOptions,
  ): Promise<WhatsAppMessageResponse> {
    if (!sticker.id && !sticker.link) {
      throw new Error('Sticker inválido: se requiere id o link');
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'sticker',
      sticker: {
        ...(sticker.id ? { id: sticker.id } : {}),
        ...(sticker.link ? { link: sticker.link } : {}),
      },
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  // =========================================================================
  // PLANTILLAS
  // =========================================================================
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: WhatsAppTemplateComponent[],
    options?: MessageContextOptions,
  ): Promise<WhatsAppMessageResponse> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  // =========================================================================
  // MENSAJES INTERACTIVOS
  // =========================================================================
  async sendInteractiveCtaUrl(
    to: string,
    params: {
      bodyText: string;
      buttonDisplayText: string;
      buttonUrl: string;
      headerImageUrl?: string;
      headerImageId?: string;
      footerText?: string;
    },
    options?: MessageContextOptions,
  ): Promise<WhatsAppMessageResponse> {
    let header: Record<string, unknown> | undefined;
    if (params.headerImageUrl) {
      header = {
        type: 'image',
        image: { link: params.headerImageUrl },
      };
    } else if (params.headerImageId) {
      header = {
        type: 'image',
        image: { id: params.headerImageId },
      };
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        ...(header ? { header } : {}),
        body: { text: params.bodyText },
        ...(params.footerText ? { footer: { text: params.footerText } } : {}),
        action: {
          name: 'cta_url',
          parameters: {
            display_text: params.buttonDisplayText,
            url: params.buttonUrl,
          },
        },
      },
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: WhatsAppInteractiveButton[],
    options?: InteractiveOptions,
  ): Promise<WhatsAppMessageResponse> {
    const interactive: Record<string, unknown> = {
      type: 'button',
      body: { text: bodyText },
      action: { buttons },
    };

    if (options?.header) {
      interactive.header =
        typeof options.header === 'string'
          ? { type: 'text', text: options.header }
          : options.header;
    }

    if (options?.footer) {
      interactive.footer = { text: options.footer };
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonText: string,
    sections: WhatsAppInteractiveListSection[],
    options?: InteractiveOptions,
  ): Promise<WhatsAppMessageResponse> {
    const interactive: Record<string, unknown> = {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections,
      },
    };

    if (options?.header) {
      interactive.header =
        typeof options.header === 'string'
          ? { type: 'text', text: options.header }
          : options.header;
    }

    if (options?.footer) {
      interactive.footer = { text: options.footer };
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  async sendLocation(
    to: string,
    location: WhatsAppLocation,
    options?: MessageContextOptions,
  ): Promise<WhatsAppMessageResponse> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'location',
      location,
    };

    if (options?.replyToMessageId) {
      payload.context = { message_id: options.replyToMessageId };
    }

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
    options?: MessageContextOptions,
  ): Promise<WhatsAppMessageResponse> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji,
      },
    };

    return this.sendMessage(payload, options?.phoneNumberId);
  }

  async sendPaymentRequest(
    to: string,
    params: PaymentRequestParams,
    options?: MessageContextOptions,
  ): Promise<WhatsAppMessageResponse> {
    const components: WhatsAppTemplateComponent[] = [];

    if (params.headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: { link: params.headerImageUrl },
          },
        ],
      });
    }

    components.push({
      type: 'body',
      parameters: [
        { type: 'text', text: params.groupName ?? '' },
        { type: 'text', text: params.month },
        { type: 'text', text: params.totalAmount },
        {
          type: 'text',
          text: params.exchangeRate ?? 'N/A',
        },
      ],
    });

    components.push({
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [{ type: 'text', text: params.paymentUrl }],
    });

    return this.sendTemplate(to, 'payment_request', 'es', components, options);
  }

  // =========================================================================
  // MARCAR MENSAJE COMO LEÍDO
  // =========================================================================
  async markAsRead(
    messageId: string,
    options?: {
      phoneNumberId?: string;
      showTypingIndicator?: boolean;
    },
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };

    if (options?.showTypingIndicator) {
      payload.typing_indicator = { type: 'text' };
    }

    try {
      await firstValueFrom(
        this.http.post(this.getApiUrl(options?.phoneNumberId), payload, {
          headers: this.getHeaders(),
        }),
      );
      this.logger.debug(`Mensaje ${messageId} marcado como leído`);
    } catch (error) {
      this.logger.warn(
        `No se pudo marcar mensaje como leído: ${(error as Error).message}`,
      );
    }
  }

  // =========================================================================
  // UTILIDADES DE MEDIOS
  // =========================================================================
  async uploadMedia(
    buffer: Buffer,
    mimeType: string,
    filename: string,
    options?: UploadMediaOptions,
  ): Promise<{ id: string }> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', buffer, {
      filename,
      contentType: mimeType,
    });

    try {
      const response = await firstValueFrom(
        this.http.post<{ id: string }>(
          this.getMediaUrl(options?.phoneNumberId),
          form,
          {
            headers: {
              Authorization: `Bearer ${this.apiToken}`,
              ...form.getHeaders(),
            },
          },
        ),
      );

      if (!response.data?.id) {
        throw new Error('No se recibió ID de media tras la carga');
      }

      return { id: response.data.id };
    } catch (error) {
      const uploadError = error as {
        response?: { data?: unknown; status?: number };
        message: string;
      };
      this.logger.error(
        `Error subiendo media: ${uploadError.response?.status} - ${JSON.stringify(uploadError.response?.data ?? uploadError.message)}`,
      );
      throw error;
    }
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    try {
      const metaResponse = await firstValueFrom(
        this.http.get<{ url?: string }>(
          `https://graph.facebook.com/${this.apiVersion}/${mediaId}`,
          {
            headers: { Authorization: `Bearer ${this.apiToken}` },
          },
        ),
      );

      const mediaUrl = metaResponse.data?.url;
      if (!mediaUrl) {
        throw new Error('No se pudo obtener la URL del recurso solicitado');
      }

      const mediaResponse = await firstValueFrom(
        this.http.get<ArrayBuffer>(mediaUrl, {
          headers: { Authorization: `Bearer ${this.apiToken}` },
          responseType: 'arraybuffer',
        }),
      );

      return Buffer.from(mediaResponse.data);
    } catch (error) {
      const downloadError = error as {
        response?: { data?: unknown; status?: number };
        message: string;
      };
      this.logger.error(
        `Error descargando media: ${downloadError.response?.status} - ${JSON.stringify(downloadError.response?.data ?? downloadError.message)}`,
      );
      throw error;
    }
  }

  // =========================================================================
  // MÉTODO INTERNO: Enviar mensaje genérico
  // =========================================================================
  private async sendMessage(
    payload: Record<string, unknown>,
    phoneNumberId?: string,
  ): Promise<WhatsAppMessageResponse> {
    try {
      const response = await firstValueFrom(
        this.http.post<WhatsAppMessageResponse>(
          this.getApiUrl(phoneNumberId),
          payload,
          { headers: this.getHeaders() },
        ),
      );

      const recipient =
        typeof payload.to === 'string' ? payload.to : 'desconocido';
      this.logger.debug(`Mensaje enviado exitosamente a ${recipient}`);
      return response.data;
    } catch (error) {
      const axiosError = error as {
        response?: { data?: unknown; status?: number };
        message: string;
      };

      this.logger.error(
        `Error enviando mensaje: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data ?? axiosError.message)}`,
      );
      throw error;
    }
  }
}
