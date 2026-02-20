/**
 * Tipos de respuesta de la API de WhatsApp Cloud
 */
export interface WhatsAppMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

/**
 * Componentes para plantillas de WhatsApp
 */
export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: Array<{
    type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
    text?: string;
    currency?: { fallback_value: string; code: string; amount_1000: number };
    date_time?: { fallback_value: string };
    image?: { link: string };
    document?: { link: string; filename?: string };
    video?: { link: string };
  }>;
  sub_type?: 'url' | 'quick_reply';
  index?: number;
}

/**
 * Botón para mensajes interactivos
 */
export interface WhatsAppInteractiveButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

/**
 * Sección de lista para mensajes interactivos
 */
export interface WhatsAppInteractiveListSection {
  title: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

/**
 * Producto para mensajes interactivos (Multi-Product Messages)
 */
export interface WhatsAppInteractiveProduct {
  product_retailer_id: string;
}

/**
 * Ubicación para mensajes de WhatsApp
 */
export interface WhatsAppLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * Opciones de contexto de mensaje (ID de teléfono, responder a mensaje)
 */
export interface MessageContextOptions {
  phoneNumberId?: string;
  replyToMessageId?: string;
}

/**
 * Opciones para mensajes multimedia (imagen, video)
 */
export interface MediaOptions extends MessageContextOptions {
  caption?: string;
}

/**
 * Opciones para mensajes de documento
 */
export interface DocumentOptions extends MessageContextOptions {
  caption?: string;
  filename?: string;
}

/**
 * Opciones para mensajes interactivos
 */
export interface InteractiveOptions extends MessageContextOptions {
  header?: Record<string, unknown> | string;
  footer?: string;
}

/**
 * Parámetros para la plantilla de solicitud de pago (payment_request)
 */
export interface PaymentRequestParams {
  month: string;
  totalAmount: string;
  paymentUrl: string;
  exchangeRate?: string;
  groupName?: string;
  headerImageUrl?: string;
}

/**
 * Opciones para carga de media
 */
export interface UploadMediaOptions {
  phoneNumberId?: string;
}

export interface WhatsAppSticker {
  id?: string;
  link?: string;
}

export interface StickerOptions extends MessageContextOptions {}
