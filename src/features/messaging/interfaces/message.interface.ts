import {
  TenantContext,
  UserRole,
  CompanyVertical,
} from '../features/whatsapp/types/whatsapp.types';

export enum Platform {
  WHATSAPP = 'WHATSAPP',
  MESSENGER = 'MESSENGER',
  TELEGRAM = 'TELEGRAM',
  WEB = 'WEB',
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  LOCATION = 'LOCATION',
  INTERACTIVE = 'INTERACTIVE',
  REACTION = 'REACTION',
  STICKER = 'STICKER',
  ORDER = 'ORDER',
  SYSTEM = 'SYSTEM',
  UNSUPPORTED = 'UNSUPPORTED',
}

export enum MessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum MessageState {
  DRAFT = 'DRAFT', // Solo Outbound
  QUEUED = 'QUEUED', // Solo Outbound
  SENDING = 'SENDING', // Solo Outbound
  SENT = 'SENT', // Efectivamente mandado
  DELIVERED = 'DELIVERED', // Recibido en cliente
  READ = 'READ', // Confirmado como leído
  FAILED = 'FAILED', // Falló en entrega
  RECEIVED = 'RECEIVED', // Solo Inbound: Recibido de webhook
}

export interface IMessage<T = any> {
  // === Unique Identifiers ===
  /** Identificador único del mensaje recibido o enviado (ej: wamid...) */
  id: string | null; // Puede ser null en drafts outbound

  /** Identificadores operacionales */
  platform: Platform;
  direction: MessageDirection;
  state: MessageState;

  /** Tipo de mensaje estandarizado (texto, imagen, video, etc) */
  type: MessageType;

  // === Senders & Recipients ===
  /** ID del remitente (ej. número de teléfono o ID de usuario en la plataforma) */
  senderId: string;

  /** Nombre del contacto o perfil si está disponible */
  senderName?: string;

  /** Número o identificador destinatario (ej. el phone_number_id de la empresa) */
  recipientId: string;

  // === Message Content ===
  /** Texto procesado, ya sea texto puro o la respuesta a un botón/lista interactiva. */
  text?: string;

  /** Payload u objeto original entregado por el webhook de la plataforma */
  rawPayload: T;

  // === Business Logic / Optus Specific Attributes ===
  /** Información de la empresa/entorno (tenant) al que pertenece el mensaje */
  tenant: TenantContext;

  /** Rol asignado para el remitente (ADMIN, CLIENT, etc.) */
  role: UserRole;

  /** Vertical o tipo de industria a la que se asocia la empresa */
  vertical: CompanyVertical;

  // === Platform independent behaviors /// Standard Methods ===

  /** Cambiar el estado o indicador del mensaje/chat (leído, escribiendo, entregado, etc) */
  changeStatus(status: 'read' | 'delivered' | 'typing'): Promise<void>;

  /** Enviar respuesta de texto estándar apuntando a este remitente */
  reply(text: string, options?: any): Promise<any>;

  /** Enviar respuesta multimedia apuntando a este remitente */
  replyWithMedia(
    mediaUrl: string,
    mediaType: MessageType,
    caption?: string,
    options?: any,
  ): Promise<any>;

  /** Enviar un sticker basándose en un evento del sistema (ej: 'error_or_unauthorized_action') */
  sendSticker(eventName: string): Promise<any>;
}
