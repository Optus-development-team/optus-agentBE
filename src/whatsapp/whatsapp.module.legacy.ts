import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { PaymentWebhookController } from './payment-webhook.controller';
import { GoogleAuthController } from './google-auth.controller';
import { IdentityService } from './services/identity.service';
import { SanitizationService } from './services/sanitization.service';
import { AgentRouterService } from './services/agent-router.service';
import { AppointmentAgentService } from './agents/appointment-agent.service';
import { SalesAgentService } from './agents/sales-agent.service';
import { ReportingAgentService } from './agents/reporting-agent.service';
import { PaymentClientService } from './services/payment-client.service';
import { SupabaseService } from './services/supabase.service';
import { AdkSessionService } from './services/adk-session.service';
import { EncryptionService } from './services/encryption.service';
import { CompanyIntegrationsService } from './services/company-integrations.service';
import { GoogleOauthService } from './services/google-oauth.service';
import { OnboardingService } from './services/onboarding.service';
import { OrdersSyncService } from './services/orders-sync.service';
import { PaymentWarmupService } from './services/payment-warmup.service';
import { GeminiService } from './services/gemini.service';
import { MetaCatalogService } from './services/meta-catalog.service';
import { X402PaymentClientService } from './services/x402-payment-client.service';
import { PinataService } from './services/pinata.service';
import { CatalogTestController } from './catalog-test.controller';
import { PaymentProxyController } from './payment-proxy.controller';

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
    WhatsappService,
    IdentityService,
    SanitizationService,
    AgentRouterService,
    AppointmentAgentService,
    SalesAgentService,
    ReportingAgentService,
    PaymentClientService,
    SupabaseService,
    AdkSessionService,
    EncryptionService,
    CompanyIntegrationsService,
    GoogleOauthService,
    OnboardingService,
    OrdersSyncService,
    PaymentWarmupService,
    GeminiService,
    MetaCatalogService,
    X402PaymentClientService,
    PinataService,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
