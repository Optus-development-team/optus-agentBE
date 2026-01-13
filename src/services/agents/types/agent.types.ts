/**
 * Tipos base para el sistema multi-agente usando Google ADK.
 * Estos tipos definen las estructuras de datos compartidas entre todos los agentes.
 */

import type { ToolContext } from '@google/adk';

/**
 * Roles de usuario en el sistema
 */
export enum UserRole {
  ADMIN = 'ROLE_ADMIN',
  CLIENT = 'ROLE_CLIENT',
}

/**
 * Intenciones detectadas por el orquestador
 */
export type AgentIntent =
  | 'BOOKING'
  | 'SHOPPING'
  | 'REPORTING'
  | 'TWO_FA'
  | 'GENERAL'
  | 'GREETING'
  | 'FAREWELL'
  | 'HELP'
  | 'FALLBACK'
  | 'UNKNOWN';

/**
 * Estados de pago en el flujo de ventas
 */
export enum PaymentState {
  CART = 'STATE_CART',
  AWAITING_QR = 'STATE_AWAITING_QR',
  QR_SENT = 'STATE_QR_SENT',
  VERIFYING = 'STATE_VERIFYING',
  COMPLETED = 'STATE_COMPLETED',
}

/**
 * Token de sanitización para datos sensibles
 */
export interface SanitizationToken {
  placeholder: string;
  rawValue: string;
  kind: 'phone' | 'email' | 'name' | 'address';
}

/**
 * Resultado de sanitización de texto
 */
export interface SanitizedTextResult {
  sanitizedText: string;
  normalizedText: string;
  tokens: SanitizationToken[];
}

/**
 * Contexto del tenant (empresa) - usado internamente por el orquestador
 */
export interface TenantContext {
  companyId: string;
  companyName: string;
  companyTone?: string;
  currency?: string;
  companyConfig?: Record<string, any>;
  phoneNumberId?: string;
  adminPhoneIds?: string[];
  displayPhoneNumber?: string | null;
}

/**
 * Información del producto referenciado desde WhatsApp
 */
export interface ReferredProduct {
  catalogId: string;
  productRetailerId: string;
}

/**
 * Contexto del mensaje para el orquestador ADK
 */
export interface AgentMessageContext {
  /** ID de sesión único (companyId:userPhone) */
  sessionId: string;
  /** Texto del mensaje del usuario */
  message: string;
  /** Teléfono del remitente */
  senderPhone: string;
  /** Nombre del remitente (si está disponible) */
  senderName?: string;
  /** Rol del usuario */
  userRole: UserRole;
  /** Contexto del tenant/empresa */
  tenantContext: TenantContext;
  /** Producto referenciado (si viene del catálogo) */
  referredProduct?: ReferredProduct;
  /** ID del mensaje de WhatsApp */
  whatsappMessageId?: string;
}

/**
 * Acciones que puede generar un agente
 */
export type AgentAction =
  | { type: 'text'; text: string; to?: string }
  | {
      type: 'image';
      imageUrl?: string;
      base64?: string;
      mimeType?: string;
      caption?: string;
      to?: string;
    }
  | {
      type: 'document';
      documentUrl?: string;
      base64?: string;
      mimeType?: string;
      filename?: string;
      caption?: string;
      to?: string;
    }
  | { type: 'video'; videoUrl?: string; caption?: string; to?: string }
  | { type: 'audio'; audioUrl?: string; to?: string }
  | {
      type: 'template';
      templateName: string;
      languageCode?: string;
      templateComponents?: unknown[];
      to?: string;
    }
  | {
      type: 'interactive_buttons';
      text: string;
      buttons: InteractiveButton[];
      header?: InteractiveHeader;
      footer?: string;
      to?: string;
    }
  | {
      type: 'interactive_list';
      text: string;
      buttonText?: string;
      sections: InteractiveListSection[];
      listHeader?: string;
      footer?: string;
      to?: string;
    };

/**
 * Botón interactivo de WhatsApp
 */
export interface InteractiveButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

/**
 * Header de mensaje interactivo
 */
export type InteractiveHeader =
  | { type: 'text'; text: string }
  | { type: 'image'; image: { link: string } };

/**
 * Sección de lista interactiva
 */
export interface InteractiveListSection {
  title: string;
  rows: Array<{
    id: string;
    title: string;
    description?: string;
  }>;
}

/**
 * Resultado de la orquestación de agentes
 */
export interface OrchestrationResult {
  /** Si la orquestación fue exitosa */
  success: boolean;
  /** Respuesta de texto del agente */
  response: string;
  /** Intención detectada */
  intent: AgentIntent | string;
  /** Agente que procesó la solicitud */
  agentUsed: string;
  /** Tiempo de procesamiento en ms */
  processingTimeMs: number;
  /** ID de sesión */
  sessionId: string;
  /** Mensaje de error (si aplica) */
  error?: string;
  /** Metadatos adicionales */
  metadata?: Record<string, unknown>;
}

/**
 * Estado de sesión del agente (usando convención de prefijos ADK)
 * - app: contexto de la aplicación (empresa, configuración)
 * - user: datos del usuario (persistentes entre sesiones)
 * - temp: datos temporales (solo durante la invocación)
 */
export interface AgentSessionState {
  // Estado de la aplicación (contexto de empresa)
  'app:companyId'?: string;
  'app:companyName'?: string;
  'app:companyTone'?: string;
  'app:currency'?: string;
  'app:todayDate'?: string;

  // Estado del usuario (persistente entre sesiones)
  'user:phone'?: string;
  'user:name'?: string;
  'user:role'?: string;
  'user:preferredLanguage'?: string;
  'user:lastOrderId'?: string;

  // Estado temporal (solo durante la invocación actual)
  'temp:processingPayment'?: boolean;
  'temp:extractedAmount'?: number;
  'temp:detectedProducts'?: string[];
  'temp:lastIntent'?: string;
  'temp:lastOrderId'?: string;

  // Cualquier otro estado personalizado
  [key: string]: unknown;
}

/**
 * Contexto de herramienta extendido con datos del sistema
 */
export interface OptSmsToolContext extends ToolContext {
  tenant: TenantContext;
  senderId: string;
  role: UserRole;
}

/**
 * Historial de chat para contexto
 */
export interface ChatHistoryItem {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

/**
 * Datos de negociación x402
 */
export interface X402NegotiationData {
  x402Version: number;
  resource: string;
  accepts: Array<{
    type: 'fiat' | 'crypto';
    currency?: string;
    symbol?: string;
    amountRequired?: number;
    base64QrSimple?: string;
  }>;
  jobId: string;
}

/**
 * Datos de settlement x402
 */
export interface X402SettlementData {
  success: boolean;
  type: 'fiat' | 'crypto';
  transaction?: string | null;
  currency?: string;
  network?: string;
  chainId?: number;
  payer?: string;
  errorReason?: string | null;
}

/**
 * Evento de sesión para historial
 */
export interface SessionEvent {
  type: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Snapshot de sesión para persistencia
 */
export interface SessionSnapshot {
  sessionId: string;
  companyId: string;
  state: AgentSessionState;
  events: SessionEvent[];
  updatedAt: Date;
}
