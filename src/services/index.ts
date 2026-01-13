/**
 * Barrel exports para todos los servicios
 *
 * Estructura de servicios:
 * - agents/     - Orquestador y subagentes de Google ADK
 * - database/   - Servicios de base de datos (Supabase)
 * - google/     - Servicios de integración con Google
 * - meta/       - Servicios de Meta/WhatsApp
 * - payments/   - Servicios de pagos fiat y x402
 * - pinata/     - Servicios de IPFS/Pinata
 */

// Agents
export * from './agents';

// Database
export * from './database';

// Google integrations
export * from './google';

// Meta / WhatsApp
export * from './meta';

// Payments
export * from './payments';

// Pinata / IPFS
export * from './pinata';
