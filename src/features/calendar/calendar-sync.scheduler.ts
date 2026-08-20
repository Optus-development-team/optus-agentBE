import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import dayjs from 'dayjs';
import { AppointmentRepository } from './appointment.repository';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleCalendarWebhookService } from './google-calendar-webhook.service';
import { AppointmentNotificationService } from './appointment-notification.service';
import { CalendarSyncJobService } from './calendar-sync-job.service';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import type { CompanyCalendarIntegration } from './calendar.types';

@Injectable()
export class CalendarSyncScheduler {
  private readonly logger = new Logger(CalendarSyncScheduler.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly sync: CalendarSyncService,
    private readonly webhooks: GoogleCalendarWebhookService,
    private readonly notifications: AppointmentNotificationService,
    private readonly jobs: CalendarSyncJobService,
    private readonly db: SupabaseService,
  ) {}

  @Cron('* * * * *')
  async incremental(): Promise<void> {
    let integrations: CompanyCalendarIntegration[];
    try {
      integrations = await this.appointments.activeIntegrations();
    } catch (error) {
      this.logger.error(
        `No se pudieron cargar integraciones: ${(error as Error).message}`,
      );
      return;
    }
    for (const integration of integrations) {
      const companyId = integration.company_id;
      if (integration.sync_direction === 'none') continue;
      if (this.running.has(companyId)) continue;
      const dueAt = dayjs(integration.last_sync_at ?? 0).add(
        integration.sync_frequency_minutes || 15,
        'minute',
      );
      if (dueAt.isAfter(dayjs())) continue;
      this.running.add(companyId);
      try {
        await this.db.withAdvisoryLock(
          `calendar-sync:${companyId}`,
          async () => {
            if (integration.sync_direction !== 'to_google') {
              await this.sync.syncFromGoogleToDb(companyId, {
                trigger: 'cron',
              });
            }
            if (integration.sync_direction !== 'from_google') {
              await this.sync.syncPendingToGoogle(companyId, 'cron');
            }
          },
        );
      } catch (error) {
        this.logger.error(`${companyId}: ${(error as Error).message}`);
      } finally {
        this.running.delete(companyId);
      }
    }
  }

  @Cron('0 3 * * *')
  async full(): Promise<void> {
    let integrations: CompanyCalendarIntegration[];
    try {
      integrations = await this.appointments.activeIntegrations();
    } catch (error) {
      this.logger.error(
        `No se pudieron cargar integraciones: ${(error as Error).message}`,
      );
      return;
    }
    for (const integration of integrations) {
      if (
        integration.last_full_sync_at &&
        dayjs(integration.last_full_sync_at).isAfter(
          dayjs().subtract(20, 'hour'),
        )
      )
        continue;
      if (this.running.has(integration.company_id)) continue;
      this.running.add(integration.company_id);
      try {
        await this.db.withAdvisoryLock(
          `calendar-sync:${integration.company_id}`,
          () => this.sync.performFullSync(integration.company_id, 'cron'),
        );
      } catch (error) {
        this.logger.error(
          `${integration.company_id}: ${(error as Error).message}`,
        );
      } finally {
        this.running.delete(integration.company_id);
      }
    }
  }

  @Cron('0 */6 * * *')
  renewWebhooks(): Promise<void> {
    return this.webhooks.renewExpiring();
  }

  @Cron('* * * * *')
  async processNotifications(): Promise<void> {
    try {
      await this.notifications.processDue();
    } catch (error) {
      this.logger.error(`Recordatorios: ${(error as Error).message}`);
    }
  }

  @Cron('*/5 * * * *')
  async reconcileNotifications(): Promise<void> {
    try {
      await this.notifications.reconcileRecent();
    } catch (error) {
      this.logger.error(
        `Reconciliación de recordatorios: ${(error as Error).message}`,
      );
    }
  }

  @Cron('* * * * *')
  async processSyncJobs(): Promise<void> {
    try {
      await this.jobs.processDue();
    } catch (error) {
      this.logger.error(`Cola de sincronización: ${(error as Error).message}`);
    }
  }
}
