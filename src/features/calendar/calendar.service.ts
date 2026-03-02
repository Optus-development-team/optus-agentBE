import { Injectable } from '@nestjs/common';
import { OAuthService } from '../auth/oauth.service';
import { google } from 'googleapis';
import dayjs from 'dayjs';
import { TimeService } from '../../common/time/time.service';

@Injectable()
export class CalendarService {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly timeService: TimeService,
  ) {}

  // --- Calendar Operations ---

  async checkAvailability(
    companyId: string,
    date: string,
    phoneNumber?: string,
  ): Promise<any[]> {
    const auth = await this.oauthService.getClient(companyId);
    const calendar = google.calendar({ version: 'v3', auth });
    const dateBounds = this.timeService.resolveDateBounds(date, phoneNumber);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: dateBounds.timeMinIso,
      timeMax: dateBounds.timeMaxIso,
      singleEvents: true,
      orderBy: 'startTime',
    });

    // Simply returning events for now, logic to determine "slots" can be added here
    return res.data.items || [];
  }

  async createAppointment(
    companyId: string,
    details: {
      summary: string;
      start: string;
      durationMinutes: number;
      description?: string;
    },
    phoneNumber?: string,
  ): Promise<any> {
    const auth = await this.oauthService.getClient(companyId);
    const calendar = google.calendar({ version: 'v3', auth });
    const timezone = this.timeService.getTimezone(phoneNumber);
    const startDate = dayjs(details.start);

    if (!startDate.isValid()) {
      throw new Error('Fecha/hora de inicio inválida para crear la cita.');
    }

    const endDate = startDate.add(details.durationMinutes, 'minute');

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: details.summary,
        description: details.description,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: timezone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: timezone,
        },
      },
    });

    return {
      ...res.data,
      calendarAppLink: this.buildCalendarAppLink(res.data.id),
    };
  }

  private buildCalendarAppLink(eventId?: string | null): string | undefined {
    if (!eventId) {
      return undefined;
    }

    return `https://calendar.app.google/${encodeURIComponent(eventId)}`;
  }
}
