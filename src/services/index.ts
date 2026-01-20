/**
 * Barrel exports para todos los servicios
 *
 * Estructura de servicios:
 * - agents/       - Orquestador y subagentes de Google ADK
 * - database/     - Servicios de base de datos (Supabase)
 * - encryption/   - Servicio de encriptación
 * - gemini/       - Servicio de Gemini directo
 * - google/       - Servicios de integración con Google OAuth
 * - identity/     - Servicio de identidad y tenants
 * - integrations/ - Servicio de integraciones de empresa
 * - meta/         - Servicios de Meta/WhatsApp Catalog
 * - onboarding/   - Servicio de onboarding
 * - orders/       - Servicio de sincronización de órdenes
 * - payments/     - Servicios de pagos fiat y x402
 * - pinata/       - Servicios de IPFS/Pinata
 * - sanitization/ - Servicio de sanitización de texto
 * - whatsapp/     - Servicio principal de WhatsApp
 */

// Agents
export * from './agents';

// Database
export * from './database';

// Encryption
export * from './encryption';

// Gemini
export * from './gemini';

// Google integrations
export * from './google';

// Identity
export * from './identity';

// Integrations
export * from './integrations';

// Meta / WhatsApp Catalog
export * from './meta';

// Onboarding
export * from './onboarding';

// Orders
export * from './orders';

// Payments
export * from './payments';

// Pinata / IPFS
export * from './pinata';

// Sanitization
export * from './sanitization';

// Sheets Sync
export * from './sheets-sync';

// WhatsApp
export * from './whatsapp';
