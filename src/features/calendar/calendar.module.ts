import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { SecurityModule } from '../../common/security/security.module';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { TimeModule } from '../../common/time/time.module';
import { AppointmentRepository } from './appointment.repository';
import { AppointmentsService } from './appointments.service';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarSyncLogService } from './calendar-sync-log.service';
import { GoogleCalendarWebhookService } from './google-calendar-webhook.service';
import { CalendarSyncScheduler } from './calendar-sync.scheduler';
import { CalendarController } from './calendar.controller';
import { GoogleCalendarWebhookController } from './google-calendar-webhook.controller';
import { AuthModule } from '../auth/auth.module';
import { WhatsappMessagingModule } from '../messaging/features/whatsapp/whatsapp-messaging.module';
import { CalendarAdminController } from './calendar-admin.controller';
import { CalendarAccessService } from './calendar-access.service';
import { BookingPolicyService } from './booking-policy.service';
import { BookingManagementService } from './booking-management.service';
import { AvailabilityService } from './availability.service';
import { AppointmentAuditService } from './appointment-audit.service';
import { AppointmentNotificationService } from './appointment-notification.service';
import { CalendarSyncJobService } from './calendar-sync-job.service';

@Module({
  imports: [
    AuthModule,
    SecurityModule,
    InfrastructureModule,
    TimeModule,
    WhatsappMessagingModule,
  ],
  controllers: [
    CalendarController,
    CalendarAdminController,
    GoogleCalendarWebhookController,
  ],
  providers: [
    CalendarService,
    AppointmentRepository,
    AppointmentsService,
    CalendarSyncService,
    CalendarSyncLogService,
    GoogleCalendarWebhookService,
    CalendarSyncScheduler,
    CalendarAccessService,
    BookingPolicyService,
    BookingManagementService,
    AvailabilityService,
    AppointmentAuditService,
    AppointmentNotificationService,
    CalendarSyncJobService,
  ],
  exports: [
    AuthModule,
    CalendarService,
    AppointmentsService,
    CalendarSyncService,
    AvailabilityService,
    BookingManagementService,
  ],
})
export class CalendarModule {}
