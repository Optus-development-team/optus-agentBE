/**
 * Módulo de WhatsApp con arquitectura de agentes ADK.
 *
 * Estructura actualizada:
 * - Orquestador ADK reemplaza al AgentRouter
 * - Servicios movidos a src/services/
 * - Sub-agentes especializados (sales, appointment, reporting)
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// Controllers
import { WhatsappController } from './whatsapp.controller';
import { PaymentWebhookController } from './payment-webhook.controller';
import { GoogleAuthController } from './google-auth.controller';
import { CatalogTestController } from './catalog-test.controller';
import { PaymentProxyController } from './payment-proxy.controller';

// Main WhatsApp Service
import { WhatsappService } from './whatsapp.service';

// Legacy services (aún en src/whatsapp/services/)
import { IdentityService } from './services/identity.service';
import { SanitizationService } from './services/sanitization.service';
import { EncryptionService } from './services/encryption.service';
import { CompanyIntegrationsService } from './services/company-integrations.service';
import { OnboardingService } from './services/onboarding.service';
import { OrdersSyncService } from './services/orders-sync.service';
import { PaymentWarmupService } from './services/payment-warmup.service';
import { GeminiService } from './services/gemini.service';

// New ADK Agent Services (src/services/agents/)
import { AdkOrchestratorService } from '../services/agents/adk-orchestrator.service';
import { AdkSessionService } from '../services/agents/session/adk-session.service';
import { SalesAgentService } from '../services/agents/subagents/sales-agent.service';
import { AppointmentAgentService } from '../services/agents/subagents/appointment-agent.service';
import { ReportingAgentService } from '../services/agents/subagents/reporting-agent.service';
import { WhatsappAdkBridgeService } from '../services/agents/whatsapp-adk-bridge.service';

// Database Services (src/services/database/)
import { SupabaseService } from '../services/database/supabase.service';

// Google Services (src/services/google/)
import { GoogleOauthService } from '../services/google/google-oauth.service';

// Meta Services (src/services/meta/)
import { MetaCatalogService } from '../services/meta/whatsapp/meta-catalog.service';

// Payment Services (src/services/payments/)
import { PaymentClientService } from '../services/payments/payment-client.service';
import { X402PaymentClientService } from '../services/payments/x402-payment-client.service';

// Pinata Services (src/services/pinata/)
import { PinataService } from '../services/pinata/pinata.service';

// Legacy Agent Router (mantener temporalmente para compatibilidad)
import { AgentRouterService } from './services/agent-router.service';
// Legacy Agents (mantener temporalmente para compatibilidad)
import { AppointmentAgentService as LegacyAppointmentAgent } from './agents/appointment-agent.service';
import { SalesAgentService as LegacySalesAgent } from './agents/sales-agent.service';
import { ReportingAgentService as LegacyReportingAgent } from './agents/reporting-agent.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [
    WhatsappController,
    PaymentWebhookController,
    GoogleAuthController,
    CatalogTestController,
    PaymentProxyController,
  ],
  providers: [
    // Core WhatsApp Service
    WhatsappService,

    // Legacy services (necesarios para WhatsappService)
    IdentityService,
    SanitizationService,
    EncryptionService,
    CompanyIntegrationsService,
    OnboardingService,
    OrdersSyncService,
    PaymentWarmupService,
    GeminiService,

    // Database
    SupabaseService,

    // ADK Session
    AdkSessionService,

    // ADK Sub-agents (new architecture)
    SalesAgentService,
    AppointmentAgentService,
    ReportingAgentService,

    // ADK Orchestrator
    AdkOrchestratorService,

    // WhatsApp-ADK Bridge
    WhatsappAdkBridgeService,

    // Google
    GoogleOauthService,

    // Meta/WhatsApp
    MetaCatalogService,

    // Payments
    PaymentClientService,
    X402PaymentClientService,

    // Pinata/IPFS
    PinataService,

    // Legacy (mantener temporalmente)
    AgentRouterService,
    LegacyAppointmentAgent,
    LegacySalesAgent,
    LegacyReportingAgent,
  ],
  exports: [
    WhatsappService,
    AdkOrchestratorService,
    WhatsappAdkBridgeService,
    SupabaseService,
  ],
})
export class WhatsappModule {}
