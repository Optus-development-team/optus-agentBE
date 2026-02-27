import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppMessage,
  WhatsAppIncomingMessage,
  WhatsAppStatus,
  WhatsAppContact,
} from '../interfaces/whatsapp.interface';
import { AdkOrchestratorService } from '../../../core/adk/orchestrator/adk-orchestrator.service';
import { WhatsAppMessagingService } from './whatsapp.messaging.service';
import { WhatsAppResponseService } from './whatsapp-response.service';
import { VerificationService } from '../../login/verification.service';
import { IdentityService } from '../../auth/identity.service';
import { TenantContext, UserRole } from '../types/whatsapp.types';

interface PendingConversation {
  canonicalSender: string;
  contactName?: string;
  phoneNumberId: string;
  tenant: TenantContext;
  role: UserRole;
  lastMessage: WhatsAppIncomingMessage;
  fragments: string[];
  timeout: NodeJS.Timeout;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly defaultPhoneNumberId: string;
  private readonly sendAgentText: boolean;
  private readonly waitUntilMessageMs: number;
  // Cache in-memory para evitar reprocesar mensajes cuando Meta reintenta el webhook.
  private readonly processedMessageCache = new Map<string, number>();
  private readonly processedMessageTtlMs = 10 * 60 * 1000; // 10 minutos
  private readonly pendingConversations = new Map<string, PendingConversation>();

  constructor(
    private readonly configService: ConfigService,
    private readonly adkOrchestrator: AdkOrchestratorService,
    private readonly messagingService: WhatsAppMessagingService,
    private readonly responseService: WhatsAppResponseService,
    private readonly verification: VerificationService,
    private readonly identity: IdentityService,
  ) {
    this.defaultPhoneNumberId =
      this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID', '') ||
      this.configService.get<string>('PHONE_NUMBER_ID', '');
    this.sendAgentText =
      this.configService.get<string>('ADK_SEND_AGENT_TEXT', 'false') === 'true';
    this.waitUntilMessageMs = Number(
      this.configService.get<string>('WAIT_UNTIL_MESSAGE', '3000'),
    );
    this.logger.log('🤖 Orquestador ADK activado');
  }

  /**
   * Verifica el webhook de WhatsApp
   */
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = this.configService.get<string>(
      'WHATSAPP_VERIFY_TOKEN',
      '',
    );

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('Webhook verificado correctamente');
      return challenge;
    }

    this.logger.error('Verificación de webhook fallida');
    return null;
  }

  /**
   * Procesa los mensajes entrantes de WhatsApp
   */
  async processIncomingMessage(body: WhatsAppMessage): Promise<void> {
    try {
      // Log del payload completo para debugging
      //this.logger.debug('Payload recibido:', JSON.stringify(body, null, 2));

      // Verificar que el objeto sea de WhatsApp
      if (body.object !== 'whatsapp_business_account') {
        this.logger.warn('Objeto no es de WhatsApp Business Account');
        return;
      }

      // Procesar cada entrada
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          const phoneNumberId =
            value.metadata?.phone_number_id ?? this.defaultPhoneNumberId;

          // Procesar mensajes
          if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              const contactWaId = this.resolveContactWaId(
                value.contacts,
                message.from,
              );
              const contactName = this.resolveContactName(
                value.contacts,
                message.from,
              );
              const tenant =
                (await this.identity.resolveTenantByPhoneId(phoneNumberId)) ??
                null;

              if (!tenant) {
                this.logger.warn(
                  `Tenant no resuelto para phone_number_id=${phoneNumberId}. Mensaje omitido.`,
                );
                continue;
              }

              const role = await this.identity.resolveRole(
                tenant,
                message.from,
                contactWaId,
              );

              await this.handleMessage(
                message,
                phoneNumberId,
                tenant,
                role,
                contactWaId,
                contactName,
              );
            }
          }

          // Procesar estados de mensajes (enviado, entregado, leído, etc.)
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              this.handleMessageStatus(status);
            }
          }
        }
      }
    } catch (error) {
      const safeError = error as Error & { response?: { data?: unknown } };
      const details = safeError.response?.data ?? safeError.message;
      this.logger.error('Error procesando mensaje entrante:', details);
      this.logger.error('Stack trace:', safeError.stack);
      this.logger.error('Payload completo:', JSON.stringify(body, null, 2));
      throw safeError;
    }
  }

  /**
   * Maneja un mensaje individual
   */
  private async handleMessage(
    message: WhatsAppIncomingMessage,
    phoneNumberId: string,
    tenant: TenantContext,
    role: UserRole,
    contactWaId?: string,
    contactName?: string,
  ): Promise<void> {
    if (this.isDuplicateMessage(message.id)) {
      this.logger.warn(
        `Mensaje duplicado detectado (id=${message.id}). Se omite para evitar reprocesamiento.`,
      );
      return;
    }

    this.logger.log(`Mensaje recibido de: ${message.from}`);
    this.logger.log(`Tipo de mensaje: ${message.type}`);

    // Log de información adicional si está disponible
    if (message.context) {
      this.logger.log(
        `Mensaje con contexto - Origen: ${message.context.from}, ID: ${message.context.id}`,
      );
      if (message.context.referred_product) {
        this.logger.log(
          `Producto referenciado - Catálogo: ${message.context.referred_product.catalog_id}, Producto: ${message.context.referred_product.product_retailer_id}`,
        );
      }
    }

    if (message.referral) {
      this.logger.log(
        `Mensaje desde anuncio - Tipo: ${message.referral.source_type}, URL: ${message.referral.source_url}`,
      );
      this.logger.log(`Headline: ${message.referral.headline}`);
      this.logger.log(`Body: ${message.referral.body}`);
      if (message.referral.ctwa_clid) {
        this.logger.log(`CTWA Click ID: ${message.referral.ctwa_clid}`);
      }
    }

    // Marcar el mensaje como leído apenas llega.
    await this.messagingService.markAsRead(message.id, {
      phoneNumberId,
      showTypingIndicator: false,
    });

    const conversationalText = this.extractConversationText(message);
    if (conversationalText) {
      await this.bufferConversationMessage({
        message,
        messageText: conversationalText,
        phoneNumberId,
        tenant,
        role,
        canonicalSender: contactWaId ?? message.from,
        contactName,
      });
      return;
    }

    switch (message.type) {
      case 'image':
        this.logger.log('Imagen recibida:', message.image);
        await this.handleMediaMessage(message, 'image', phoneNumberId);
        break;

      case 'video':
        this.logger.log('Video recibido:', message.video);
        await this.handleMediaMessage(message, 'video', phoneNumberId);
        break;

      case 'audio':
        this.logger.log('Audio recibido:', message.audio);
        await this.handleMediaMessage(message, 'audio', phoneNumberId);
        break;

      case 'document':
        this.logger.log('Documento recibido:', message.document);
        await this.handleMediaMessage(message, 'document', phoneNumberId);
        break;

      case 'location':
        this.logger.log('Ubicación recibida:', message.location);
        await this.handleLocationMessage(message, phoneNumberId);
        break;

      case 'reaction':
        this.logger.log('Reacción recibida');
        break;

      case 'sticker':
        this.logger.log('Sticker recibido');
        break;

      case 'order':
        this.logger.log('Orden recibida');
        break;

      case 'system':
        this.logger.log('Mensaje de sistema recibido');
        break;

      case 'unsupported':
        this.logger.warn('Tipo de mensaje no soportado');
        if (message.errors && message.errors.length > 0) {
          message.errors.forEach((error) => {
            this.logger.error(
              `Error ${error.code}: ${error.title} - ${error.message || 'Sin detalles'}`,
            );
          });
        }
        break;

      default:
        this.logger.warn(`Tipo de mensaje no manejado: ${message.type}`);
    }
  }

  /**
   * Maneja mensajes de texto con lógica de respuesta automática
   */
  private async handleTextMessage(
    message: WhatsAppIncomingMessage,
    phoneNumberId: string,
    tenant: TenantContext,
    role: UserRole,
    contactWaId?: string,
    contactName?: string,
  ): Promise<void> {
    if (!message.text) return;

    const canonicalSender = contactWaId ?? message.from;
    this.logger.log(`📨 Procesando mensaje de ${canonicalSender}`);

    /*     const verifiedViaOtp = await this.verification.verifyFromMessage(
      canonicalSender,
      message.text.body,
    );

    if (verifiedViaOtp) {
      await this.verification.markPhoneVerified(canonicalSender);
      await this.messagingService.sendText(
        canonicalSender,
        '✅ Número verificado. Ya puedes continuar en la app.',
        { phoneNumberId },
      );
      return;
    } */

    await this.handleWithAdkOrchestrator(
      canonicalSender,
      message,
      phoneNumberId,
      tenant,
      role,
      contactName,
    );
  }

  /**
   * Procesa mensaje usando el orquestador ADK (Google Agent Development Kit)
   */
  private async handleWithAdkOrchestrator(
    canonicalSender: string,
    message: WhatsAppIncomingMessage,
    phoneNumberId: string,
    tenant: TenantContext,
    role: UserRole,
    contactName?: string,
  ): Promise<void> {
    this.logger.debug(
      `🤖 Procesando con ADK orchestrator para ${canonicalSender}`,
    );

    try {
      const result = await this.adkOrchestrator.route({
        senderId: canonicalSender,
        senderName: contactName,
        whatsappMessageId: message.id,
        originalText: message.text?.body ?? '',
        message,
        phoneNumberId,
        tenant,
        role,
      });

      this.logger.debug(`🪧 [ADK] Mensaje ${result.responseText}`);
      if (this.sendAgentText && result.responseText?.trim()) {
        await this.responseService.sendSmartText(
          canonicalSender,
          result.responseText,
          {
            phoneNumberId,
            companyId: tenant.companyId,
          },
        );
        this.logger.log(
          `🪧 [ADK] Mensaje enviado para ${canonicalSender} - Intent: ${result.intent}`,
        );
      }

      this.logger.log(
        `✅ [ADK] Mensaje procesado para ${canonicalSender} - Intent: ${result.intent}`,
      );
    } catch (error) {
      this.logger.error(`❌ Error en ADK orchestrator:`, error);
      // Fallback a mensaje de error amigable
      await this.responseService.sendSmartText(
        canonicalSender,
        'Lo siento, tuve un problema procesando tu mensaje. Por favor intenta de nuevo.',
        {
          phoneNumberId,
          companyId: tenant.companyId,
        },
      );
      await this.responseService.sendStickerForEvent(
        canonicalSender,
        'error_or_unauthorized_action',
        {
          phoneNumberId,
          companyId: tenant.companyId,
        },
      );
    }
  }

  /**
   * Maneja mensajes con medios (imagen, video, audio, documento)
   */
  private async handleMediaMessage(
    message: WhatsAppIncomingMessage,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    phoneNumberId: string,
  ): Promise<void> {
    const media = message[mediaType];
    if (!media) return;

    this.logger.log(
      `${mediaType} recibido - ID: ${media.id}, MIME: ${media.mime_type}`,
    );

    // Aquí puedes implementar lógica para descargar y procesar el medio
    // Por ejemplo: const mediaBuffer = await this.messagingService.downloadMedia(media.id);

    await this.responseService.sendSmartText(
      message.from,
      `Recibí tu ${mediaType === 'image' ? 'imagen' : mediaType === 'video' ? 'video' : mediaType === 'audio' ? 'audio' : 'documento'}. Para continuar necesito una instrucción en texto (ej. "Pagar 1250" o "Agendar cita").`,
      { phoneNumberId },
    );
  }

  /**
   * Maneja mensajes de ubicación
   */
  private async handleLocationMessage(
    message: WhatsAppIncomingMessage,
    phoneNumberId: string,
  ): Promise<void> {
    if (!message.location) return;

    this.logger.log(
      `Ubicación recibida - Lat: ${message.location.latitude}, Lng: ${message.location.longitude}`,
    );

    if (message.location.name) {
      this.logger.log(`Nombre del lugar: ${message.location.name}`);
    }

    await this.responseService.sendSmartText(
      message.from,
      'Ubicación recibida. Confírmame en texto cómo deseas usarla y la enrutamos al agente correspondiente.',
      { phoneNumberId },
    );
  }

  private async bufferConversationMessage(params: {
    message: WhatsAppIncomingMessage;
    messageText: string;
    phoneNumberId: string;
    tenant: TenantContext;
    role: UserRole;
    canonicalSender: string;
    contactName?: string;
  }): Promise<void> {
    const key = this.getConversationKey(
      params.phoneNumberId,
      params.canonicalSender,
    );

    const previous = this.pendingConversations.get(key);
    if (previous) {
      clearTimeout(previous.timeout);
    }

    const fragments = previous
      ? [...previous.fragments, params.messageText]
      : [params.messageText];

    const timeout = setTimeout(() => {
      this.flushConversation(key).catch((error) => {
        this.logger.error(
          `Error procesando buffer de conversación ${key}: ${(error as Error).message}`,
        );
      });
    }, this.waitUntilMessageMs);

    this.pendingConversations.set(key, {
      canonicalSender: params.canonicalSender,
      contactName: params.contactName,
      phoneNumberId: params.phoneNumberId,
      tenant: params.tenant,
      role: params.role,
      lastMessage: params.message,
      fragments,
      timeout,
    });
  }

  private async flushConversation(key: string): Promise<void> {
    const pending = this.pendingConversations.get(key);
    if (!pending) {
      return;
    }

    this.pendingConversations.delete(key);

    const aggregatedText = pending.fragments
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0)
      .join('\n');

    if (!aggregatedText) {
      return;
    }

    await this.messagingService.markAsRead(pending.lastMessage.id, {
      phoneNumberId: pending.phoneNumberId,
      showTypingIndicator: true,
    });

    /*     await this.responseService.sendStickerForEvent(
      pending.canonicalSender,
      'processing_ai_thinking',
      {
        phoneNumberId: pending.phoneNumberId,
        companyId: pending.tenant.companyId,
      },
    ); */

    const mergedMessage = {
      ...pending.lastMessage,
      type: 'text',
      text: {
        body: aggregatedText,
      },
    } as WhatsAppIncomingMessage;

    await this.handleTextMessage(
      mergedMessage,
      pending.phoneNumberId,
      pending.tenant,
      pending.role,
      pending.canonicalSender,
      pending.contactName,
    );
  }

  private extractConversationText(
    message: WhatsAppIncomingMessage,
  ): string | undefined {
    if (message.type === 'text' && message.text?.body?.trim()) {
      return message.text.body.trim();
    }

    if (message.type === 'interactive' && message.interactive) {
      const buttonSelection =
        message.interactive.button_reply?.id ??
        message.interactive.button_reply?.title;
      if (buttonSelection?.trim()) {
        return buttonSelection.trim();
      }

      const listSelection =
        message.interactive.list_reply?.id ?? message.interactive.list_reply?.title;
      if (listSelection?.trim()) {
        return listSelection.trim();
      }
    }

    if (message.type === 'button') {
      const buttonText = (message as { button?: { text?: string } }).button?.text;
      if (buttonText?.trim()) {
        return buttonText.trim();
      }
    }

    return undefined;
  }

  private getConversationKey(phoneNumberId: string, sender: string): string {
    return `${phoneNumberId}:${sender}`;
  }

  /**
   * Maneja los estados de los mensajes
   */
  private handleMessageStatus(status: WhatsAppStatus): void {
    this.logger.log(
      `Estado del mensaje ${status.id}: ${status.status} - Destinatario: ${status.recipient_id}`,
    );
  }

  private isDuplicateMessage(messageId: string | undefined): boolean {
    if (!messageId) {
      return false;
    }

    const now = Date.now();
    this.pruneProcessedMessages(now);

    if (this.processedMessageCache.has(messageId)) {
      return true;
    }

    this.processedMessageCache.set(messageId, now);
    return false;
  }

  private pruneProcessedMessages(reference: number): void {
    for (const [id, timestamp] of this.processedMessageCache.entries()) {
      if (reference - timestamp > this.processedMessageTtlMs) {
        this.processedMessageCache.delete(id);
      }
    }
  }

  private resolveContactWaId(
    contacts: WhatsAppContact[] | undefined,
    messageFrom: string,
  ): string | undefined {
    if (!contacts?.length) {
      return undefined;
    }

    const match = contacts.find((contact) => contact.wa_id === messageFrom);
    return match?.wa_id ?? contacts[0]?.wa_id;
  }

  private resolveContactName(
    contacts: WhatsAppContact[] | undefined,
    messageFrom: string,
  ): string | undefined {
    if (!contacts?.length) {
      return undefined;
    }

    const match = contacts.find((contact) => contact.wa_id === messageFrom);
    const target = match ?? contacts[0];
    return target?.profile?.name;
  }
}
