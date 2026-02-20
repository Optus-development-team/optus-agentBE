import { Injectable } from '@nestjs/common';
import { OAuthService } from '../auth/oauth.service';
import { google } from 'googleapis';

@Injectable()
export class CalendarService {
  constructor(private readonly oauthService: OAuthService) {}

  // --- Calendar Operations ---

  async checkAvailability(companyId: string, date: string): Promise<any[]> {
    const auth = await this.oauthService.getClient(companyId);
    const calendar = google.calendar({ version: 'v3', auth });

    const timeMin = new Date(date);
    timeMin.setHours(0, 0, 0, 0);
    const timeMax = new Date(date);
    timeMax.setHours(23, 59, 59, 999);

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
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
      end: string;
      description?: string;
    },
  ): Promise<any> {
    const auth = await this.oauthService.getClient(companyId);
    const calendar = google.calendar({ version: 'v3', auth });

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: details.summary,
        description: details.description,
        start: { dateTime: details.start }, // format: "2024-01-01T10:00:00-05:00"
        end: { dateTime: details.end },
      },
    });
    return res.data;
  }
}
