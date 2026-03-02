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
import { ClientOrchestratorService } from './orchestrator/client_orchestrator/client-orchestrator.service';
import { CompanyOrchestratorService } from './orchestrator/company_orchestrator/company-orchestrator.service';
import { AppointmentAdminAgent } from './agents/appointment/admin/appointment.agent';
import { AppointmentClientAgent } from './agents/appointment/client/appointment.agent';
import { ReportingAgent } from './agents/reporting/reporting.agent';
import { SalesAgent } from './agents/sales/sales.agent';
import { ReestockAgent } from './agents/reestock/reestock.agent';
import { AppointmentToolsService } from './agents/appointment/appointment.tools';
import { ReportingToolsService } from './agents/reporting/reporting.tools';
import { SalesToolsService } from './agents/sales/sales.tools';
import { ReestockToolsService } from './agents/reestock/reestock.tools';
import { SupabaseSessionService } from './session/supabase-session.service';
import { KnowledgeBaseToolsService } from './agents/knowledge/knowledge.tools';
import { KnowledgeAgent } from './agents/knowledge/knowledge.agent';
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
    ClientOrchestratorService,
    CompanyOrchestratorService,
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
    SupabaseSessionService,
  ],
  exports: [AdkOrchestratorService],
})
export class AdkModule {}
