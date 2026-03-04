import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { LoginModule } from '../../features/login/login.module';
import { CompanyModule } from '../../features/company/company.module';
import { PaymentsModule } from '../../features/payments/payments.module';
import { CalendarModule } from '../../features/calendar/calendar.module';
import { WhatsappMessagingModule } from '../../features/whatsapp/whatsapp-messaging.module';
import { AdkOrchestratorService } from './orchestrator/adk-orchestrator.service';
import { OrchestratorToolsService } from './orchestrator/orchestrator.tools';
import { GeneralClientOrchestratorService } from './orchestrator/verticals/general/general-client.orchestrator';
import { GeneralAdminOrchestratorService } from './orchestrator/verticals/general/general-admin.orchestrator';
import { AcademyClientOrchestratorService } from './orchestrator/verticals/academy/academy-client.orchestrator';
import { AcademyAdminOrchestratorService } from './orchestrator/verticals/academy/academy-admin.orchestrator';
import { SalonClientOrchestratorService } from './orchestrator/verticals/salon/salon-client.orchestrator';
import { SalonAdminOrchestratorService } from './orchestrator/verticals/salon/salon-admin.orchestrator';
import { AppointmentAdminAgent } from './agents/general/appointment/admin/appointment.agent';
import { AppointmentClientAgent } from './agents/general/appointment/client/appointment.agent';
import { ReportingAgent } from './agents/general/reporting/reporting.agent';
import { SalesAgent } from './agents/general/sales/sales.agent';
import { ReestockAgent } from './agents/general/reestock/reestock.agent';
import { AppointmentToolsService } from './agents/general/appointment/appointment.tools';
import { ReportingToolsService } from './agents/general/reporting/reporting.tools';
import { SalesToolsService } from './agents/general/sales/sales.tools';
import { ReestockToolsService } from './agents/general/reestock/reestock.tools';
import { SupabaseSessionService } from './session/supabase-session.service';
import { KnowledgeBaseToolsService } from './agents/general/knowledge/knowledge.tools';
import { KnowledgeAgent } from './agents/general/knowledge/knowledge.agent';
import { AcademyAgent } from './agents/verticals/academy/academy.agent';
import { AcademyToolsService } from './agents/verticals/academy/academy.tools';
import { SalonStylistAgent } from './agents/verticals/salon/salon.agent';
import { SalonToolsService } from './agents/verticals/salon/salon.tools';
import { TimeModule } from '../../common/time/time.module';

@Module({
  imports: [
    ConfigModule,
    InfrastructureModule,
    LoginModule,
    CompanyModule,
    PaymentsModule,
    CalendarModule,
    WhatsappMessagingModule,
    TimeModule,
  ],
  providers: [
    AdkOrchestratorService,
    GeneralClientOrchestratorService,
    GeneralAdminOrchestratorService,
    AcademyClientOrchestratorService,
    AcademyAdminOrchestratorService,
    SalonClientOrchestratorService,
    SalonAdminOrchestratorService,
    OrchestratorToolsService,
    AppointmentAdminAgent,
    AppointmentClientAgent,
    ReportingAgent,
    SalesAgent,
    ReestockAgent,
    AppointmentToolsService,
    ReportingToolsService,
    SalesToolsService,
    ReestockToolsService,
    KnowledgeBaseToolsService,
    KnowledgeAgent,
    AcademyToolsService,
    AcademyAgent,
    SalonToolsService,
    SalonStylistAgent,
    SupabaseSessionService,
  ],
  exports: [AdkOrchestratorService],
})
export class AdkModule {}
