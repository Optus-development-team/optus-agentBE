export type StickerEventKey =
  | 'appointment_scheduled'
  | 'appointment_confirmed'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'appointment_reminder'
  | 'order_b2c_received'
  | 'order_b2c_preparing'
  | 'order_b2c_sent'
  | 'order_b2c_delivered'
  | 'supplier_payment_started'
  | 'supplier_payment_confirmed_avalanche'
  | 'client_payment_received'
  | 'payment_failed_or_rejected'
  | 'stock_low_alert'
  | 'rfq_sent_to_suppliers'
  | 'supplier_quote_received'
  | 'po_approved_by_admin'
  | 'po_sent_to_supplier'
  | 'warehouse_goods_received_complete'
  | 'warehouse_goods_received_partial_or_error'
  | 'google_login_success'
  | 'ai_report_generated'
  | 'catalog_new_product_added'
  | 'user_action_cancelled'
  | 'error_or_unauthorized_action'
  | 'processing_ai_thinking';

export const STICKER_EVENT_ENV_MAP: Record<StickerEventKey, string> = {
  appointment_scheduled: 'WHATSAPP_STICKER_APPOINTMENT_SCHEDULED',
  appointment_confirmed: 'WHATSAPP_STICKER_APPOINTMENT_CONFIRMED',
  appointment_cancelled: 'WHATSAPP_STICKER_APPOINTMENT_CANCELLED',
  appointment_rescheduled: 'WHATSAPP_STICKER_APPOINTMENT_RESCHEDULED',
  appointment_reminder: 'WHATSAPP_STICKER_APPOINTMENT_REMINDER',
  order_b2c_received: 'WHATSAPP_STICKER_ORDER_B2C_RECEIVED',
  order_b2c_preparing: 'WHATSAPP_STICKER_ORDER_B2C_PREPARING',
  order_b2c_sent: 'WHATSAPP_STICKER_ORDER_B2C_SENT',
  order_b2c_delivered: 'WHATSAPP_STICKER_ORDER_B2C_DELIVERED',
  supplier_payment_started: 'WHATSAPP_STICKER_SUPPLIER_PAYMENT_STARTED',
  supplier_payment_confirmed_avalanche:
    'WHATSAPP_STICKER_SUPPLIER_PAYMENT_CONFIRMED_AVALANCHE',
  client_payment_received: 'WHATSAPP_STICKER_CLIENT_PAYMENT_RECEIVED',
  payment_failed_or_rejected: 'WHATSAPP_STICKER_PAYMENT_FAILED_OR_REJECTED',
  stock_low_alert: 'WHATSAPP_STICKER_STOCK_LOW_ALERT',
  rfq_sent_to_suppliers: 'WHATSAPP_STICKER_RFQ_SENT_TO_SUPPLIERS',
  supplier_quote_received: 'WHATSAPP_STICKER_SUPPLIER_QUOTE_RECEIVED',
  po_approved_by_admin: 'WHATSAPP_STICKER_PO_APPROVED_BY_ADMIN',
  po_sent_to_supplier: 'WHATSAPP_STICKER_PO_SENT_TO_SUPPLIER',
  warehouse_goods_received_complete:
    'WHATSAPP_STICKER_WAREHOUSE_GOODS_RECEIVED_COMPLETE',
  warehouse_goods_received_partial_or_error:
    'WHATSAPP_STICKER_WAREHOUSE_GOODS_RECEIVED_PARTIAL_OR_ERROR',
  google_login_success: 'WHATSAPP_STICKER_GOOGLE_LOGIN_SUCCESS',
  ai_report_generated: 'WHATSAPP_STICKER_AI_REPORT_GENERATED',
  catalog_new_product_added: 'WHATSAPP_STICKER_CATALOG_NEW_PRODUCT_ADDED',
  user_action_cancelled: 'WHATSAPP_STICKER_USER_ACTION_CANCELLED',
  error_or_unauthorized_action:
    'WHATSAPP_STICKER_ERROR_OR_UNAUTHORIZED_ACTION',
  processing_ai_thinking: 'WHATSAPP_STICKER_PROCESSING_AI_THINKING',
};
