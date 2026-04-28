import { Platform, MessageType, MessageDirection, MessageState, IMessage } from '../../interfaces/message.interface';
import { WhatsAppIncomingMessage } from '../dto/whatsapp-webhook.dto';
import { TenantContext, UserRole, CompanyVertical } from '../types/whatsapp.types';
import { WhatsAppMessagingService } from '../services/whatsapp.messaging.service';
import { WhatsAppResponseService } from '../services/whatsapp-response.service';

/**
 * Representa un mensaje recibido por webhook de WhatsApp
 */
export class WhatsAppInboundMessage implements IMessage<WhatsAppIncomingMessage> {
  public id: string;
  public readonly platform = Platform.WHATSAPP;
  public readonly direction = MessageDirection.INBOUND;
  public state = MessageState.RECEIVED; // Mensaje Inbound existe porque se recibió
  
  public readonly type: MessageType;

  public readonly senderId: string;
  public readonly senderName?: string;
  public readonly recipientId: string;

  public readonly text?: string;
  public readonly rawPayload: WhatsAppIncomingMessage;

  public readonly tenant: TenantContext;
  public readonly role: UserRole;
  public readonly vertical: CompanyVertical;

  constructor(
    payload: WhatsAppIncomingMessage,
    phoneNumberId: string,
    contactName: string | undefined,
    tenant: TenantContext,
    role: UserRole,
    private readonly messagingService: WhatsAppMessagingService,
    private readonly responseService: WhatsAppResponseService,
  ) {
    this.rawPayload = payload;
    this.id = payload.id;
    this.senderId = payload.from;
    this.recipientId = phoneNumberId;
    this.senderName = contactName;
    this.tenant = tenant;
    this.role = role;
    this.vertical = tenant.vertical;

    this.type = this.mapType(payload.type);
    this.text = this.extractConversationText(payload);
  }

  private mapType(waType: string): MessageType {
    switch (waType) {
      case 'text': return MessageType.TEXT;
      case 'image': return MessageType.IMAGE;
      case 'audio': return MessageType.AUDIO;
      case 'video': return MessageType.VIDEO;
      case 'document': return MessageType.DOCUMENT;
      case 'location': return MessageType.LOCATION;
      case 'interactive':
      case 'button': return MessageType.INTERACTIVE;
      case 'reaction': return MessageType.REACTION;
      case 'sticker': return MessageType.STICKER;
      case 'order': return MessageType.ORDER;
      case 'system': return MessageType.SYSTEM;
      default: return MessageType.UNSUPPORTED;
    }
  }

  private extractConversationText(message: WhatsAppIncomingMessage): string | undefined {
    if (message.type === 'text' && message.text?.body?.trim()) {
      return message.text.body.trim();
    }
    if (message.type === 'interactive' && message.interactive) {
      const btn = message.interactive.button_reply?.id ?? message.interactive.button_reply?.title;
      if (btn?.trim()) return btn.trim();
      const lst = message.interactive.list_reply?.id ?? message.interactive.list_reply?.title;
      if (lst?.trim()) return lst.trim();
    }
    if (message.type === 'button') {
      const txt = (message as any).button?.text;
      if (txt?.trim()) return txt.trim();
    }
    return undefined;
  }

  async changeStatus(status: 'read' | 'delivered' | 'typing'): Promise<void> {
    if (status === 'read' && this.state !== MessageState.READ) {
      await this.messagingService.markAsRead(this.id, {
        phoneNumberId: this.recipientId,
        companyId: this.tenant.companyId,
        showTypingIndicator: false,
      });
      this.state = MessageState.READ; // Actualizar estado interno
    } else if (status === 'typing') {
      await this.messagingService.markAsRead(this.id, {
        phoneNumberId: this.recipientId,
        companyId: this.tenant.companyId,
        showTypingIndicator: true,
      });
    }
  }

  async reply(text: string, options?: any): Promise<any> {
    return this.responseService.sendSmartText(this.senderId, text, {
      phoneNumberId: this.recipientId,
      companyId: this.tenant.companyId,
      ...(options || {}),
    });
  }

  async replyWithMedia(mediaUrl: string, mediaType: MessageType, caption?: string, options?: any): Promise<any> {
    const opts = { caption, phoneNumberId: this.recipientId, companyId: this.tenant.companyId, ...(options || {}) };
    switch (mediaType) {
      case MessageType.IMAGE: return this.messagingService.sendImage(this.senderId, { link: mediaUrl }, opts);
      case MessageType.VIDEO: return this.messagingService.sendVideo(this.senderId, { link: mediaUrl }, opts);
      case MessageType.DOCUMENT: return this.messagingService.sendDocument(this.senderId, { link: mediaUrl }, opts);
      case MessageType.AUDIO: return this.messagingService.sendAudio(this.senderId, { link: mediaUrl }, opts);
      default: throw new Error(`Media type ${mediaType} not natively supported for inline quick reply yet.`);
    }
  }

  async sendSticker(eventName: string): Promise<any> {
    return this.responseService.sendStickerForEvent(this.senderId, eventName as any, {
      phoneNumberId: this.recipientId,
      companyId: this.tenant.companyId,
    });
  }
}
