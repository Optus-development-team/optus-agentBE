import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import { AppointmentRepository } from './appointment.repository';
import { CalendarService } from './calendar.service';

@Injectable()
export class GoogleCalendarWebhookService {
  private readonly logger = new Logger(GoogleCalendarWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly db: SupabaseService,
    private readonly appointments: AppointmentRepository,
    private readonly calendar: CalendarService,
  ) {}

  async setup(companyId: string): Promise<{ configured: number }> {
    const webhookUrl = this.config.get<string>('GOOGLE_CALENDAR_WEBHOOK_URL');
    if (!webhookUrl?.startsWith('https://')) {
      throw new Error('GOOGLE_CALENDAR_WEBHOOK_URL debe ser una URL HTTPS');
    }

    const calendars = await this.appointments.listCalendars(companyId);
    let configured = 0;
    for (const item of calendars) {
      await this.stopForCalendar(companyId, item.calendar_id);
      const channelId = randomUUID();
      const channel = await this.calendar.watch(
        companyId,
        item.calendar_id,
        channelId,
        webhookUrl,
      );
      if (!channel.resourceId) {
        throw new Error(
          `Google no devolvió resourceId para ${item.calendar_id}`,
        );
      }
      const expiration = channel.expiration
        ? new Date(Number(channel.expiration))
        : new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
      await this.db.query(
        `INSERT INTO google_calendar_webhook_channels (
           company_id, calendar_id, channel_id, resource_id, webhook_url,
           expiration, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         ON CONFLICT (channel_id) DO UPDATE
           SET resource_id = EXCLUDED.resource_id,
               expiration = EXCLUDED.expiration, is_active = TRUE,
               updated_at = NOW()`,
        [
          companyId,
          item.calendar_id,
          channelId,
          channel.resourceId,
          webhookUrl,
          expiration.toISOString(),
        ],
      );
      configured++;
    }

    await this.db.query(
      `UPDATE company_integrations
          SET webhook_configured = TRUE, webhook_url = $2, updated_at = NOW()
        WHERE company_id = $1 AND provider = 'GOOGLE_CALENDAR'`,
      [companyId, webhookUrl],
    );
    return { configured };
  }

  async renewExpiring(): Promise<void> {
    const companies = await this.db.query<{ company_id: string }>(
      `SELECT DISTINCT company_id
         FROM google_calendar_webhook_channels
        WHERE is_active = TRUE AND expiration < NOW() + INTERVAL '24 hours'`,
    );
    for (const { company_id: companyId } of companies) {
      try {
        await this.setup(companyId);
      } catch (error) {
        this.logger.error(
          `No se pudieron renovar webhooks de ${companyId}: ${(error as Error).message}`,
        );
      }
    }
  }

  async stopAll(companyId: string): Promise<void> {
    const calendars = await this.db.query<{ calendar_id: string }>(
      `SELECT DISTINCT calendar_id FROM google_calendar_webhook_channels
        WHERE company_id = $1 AND is_active = TRUE`,
      [companyId],
    );
    for (const item of calendars) {
      await this.stopForCalendar(companyId, item.calendar_id);
    }
    await this.db.query(
      `UPDATE company_integrations
          SET webhook_configured = FALSE, updated_at = NOW()
        WHERE company_id = $1 AND provider = 'GOOGLE_CALENDAR'`,
      [companyId],
    );
  }

  async resolveChannel(
    channelId: string,
    resourceId: string,
  ): Promise<{ companyId: string; calendarId: string } | null> {
    const rows = await this.db.query<{
      company_id: string;
      calendar_id: string;
    }>(
      `SELECT company_id, calendar_id
         FROM google_calendar_webhook_channels
        WHERE channel_id = $1 AND resource_id = $2 AND is_active = TRUE
          AND expiration > NOW() LIMIT 1`,
      [channelId, resourceId],
    );
    return rows[0]
      ? { companyId: rows[0].company_id, calendarId: rows[0].calendar_id }
      : null;
  }

  private async stopForCalendar(
    companyId: string,
    calendarId: string,
  ): Promise<void> {
    const rows = await this.db.query<{
      channel_id: string;
      resource_id: string;
    }>(
      `SELECT channel_id, resource_id
         FROM google_calendar_webhook_channels
        WHERE company_id = $1 AND calendar_id = $2 AND is_active = TRUE`,
      [companyId, calendarId],
    );
    for (const row of rows) {
      try {
        await this.calendar.stopChannel(
          companyId,
          row.channel_id,
          row.resource_id,
        );
      } catch (error) {
        this.logger.warn(
          `No se pudo detener el canal ${row.channel_id}: ${(error as Error).message}`,
        );
      }
    }
    await this.db.query(
      `UPDATE google_calendar_webhook_channels
          SET is_active = FALSE, updated_at = NOW()
        WHERE company_id = $1 AND calendar_id = $2 AND is_active = TRUE`,
      [companyId, calendarId],
    );
  }
}
