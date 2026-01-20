/**
 * Módulo de WhatsApp con arquitectura de agentes ADK.
 *
 * Estructura actualizada:
 * - Orquestador ADK reemplaza al AgentRouter
 * - Todos los servicios en src/services/
 * - Sub-agentes especializados (sales, appointment, reporting)
 * - Controladores en src/controllers/
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

// Controllers (src/controllers/)
import {
  WhatsappController,
  PaymentWebhookController,
  GoogleAuthController,
  CatalogTestController,
  PaymentProxyController,
  SheetsSyncController,
} from './controllers';

// Services - Database
import { SupabaseService } from './services/database/supabase.service';

// Services - Core
import { EncryptionService } from './services/encryption/encryption.service';
import { SanitizationService } from './services/sanitization/sanitization.service';
import { IdentityService } from './services/identity/identity.service';
import { CompanyIntegrationsService } from './services/integrations/company-integrations.service';
import { OnboardingService } from './services/onboarding/onboarding.service';
import { OrdersSyncService } from './services/orders/orders-sync.service';
import { GeminiService } from './services/gemini/gemini.service';

// Services - Sheets Sync (Universal Schema)
import { SheetsSyncService } from './services/sheets-sync/sheets-sync.service';

// Services - ADK Agents
import { AdkOrchestratorService } from './services/agents/adk-orchestrator.service';
import { AdkSessionService } from './services/agents/session/adk-session.service';
import { SalesAgentService } from './services/agents/subagents/sales-agent.service';
import { AppointmentAgentService } from './services/agents/subagents/appointment-agent.service';
import { ReportingAgentService } from './services/agents/subagents/reporting-agent.service';
import { WhatsappAdkBridgeService } from './services/agents/whatsapp-adk-bridge.service';

// Services - Google
import { GoogleOauthService } from './services/google/google-oauth.service';

// Services - Meta
import { MetaCatalogService } from './services/meta/whatsapp/meta-catalog.service';

// Services - Payments
import { PaymentClientService } from './services/payments/payment-client.service';
import { X402PaymentClientService } from './services/payments/x402-payment-client.service';

// Services - Pinata
import { PinataService } from './services/pinata/pinata.service';

// Services - WhatsApp
import { WhatsappService } from './services/whatsapp/whatsapp.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [
    WhatsappController,
    PaymentWebhookController,
    GoogleAuthController,
    CatalogTestController,
    PaymentProxyController,
    SheetsSyncController,
  ],
  providers: [
    // Database
    SupabaseService,

    // Core Services
    EncryptionService,
    SanitizationService,
    IdentityService,
    CompanyIntegrationsService,
    OnboardingService,
    OrdersSyncService,
    GeminiService,

    // Sheets Sync (Universal Schema)
    SheetsSyncService,

    // ADK Session
    AdkSessionService,

    // ADK Sub-agents
    SalesAgentService,
    AppointmentAgentService,
    ReportingAgentService,

    // ADK Orchestrator
    AdkOrchestratorService,

    // WhatsApp-ADK Bridge
    WhatsappAdkBridgeService,

    // Google
    GoogleOauthService,

    // Meta/WhatsApp Catalog
    MetaCatalogService,

    // Payments
    PaymentClientService,
    X402PaymentClientService,

    // Pinata/IPFS
    PinataService,

    // WhatsApp Main Service
    WhatsappService,
  ],
  exports: [
    WhatsappService,
    AdkOrchestratorService,
    WhatsappAdkBridgeService,
    SupabaseService,
    IdentityService,
    SheetsSyncService,
  ],
})
export class WhatsappModule {}
