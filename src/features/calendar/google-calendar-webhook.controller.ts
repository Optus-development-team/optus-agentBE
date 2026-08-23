import { Controller, Headers, Post } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { CalendarSyncJobService } from './calendar-sync-job.service';
import { GoogleCalendarWebhookService } from './google-calendar-webhook.service';

@ApiTags('webhooks')
@Controller('webhooks/google-calendar')
export class GoogleCalendarWebhookController {
  constructor(
    private readonly webhooks: GoogleCalendarWebhookService,
    private readonly jobs: CalendarSyncJobService,
  ) {}

  @Post()
  @ApiExcludeEndpoint()
  async handle(
    @Headers('x-goog-resource-state') resourceState?: string,
    @Headers('x-goog-channel-id') channelId?: string,
    @Headers('x-goog-resource-id') resourceId?: string,
  ): Promise<{ status: string }> {
    if (!channelId || !resourceId) return { status: 'ignored' };
    const channel = await this.webhooks.resolveChannel(channelId, resourceId);
    if (!channel) return { status: 'ignored' };
    if (resourceState === 'sync') return { status: 'acknowledged' };
    if (resourceState !== 'exists' && resourceState !== 'not_exists') {
      return { status: 'ignored' };
    }

    await this.jobs.enqueueWebhook(channel.companyId, channel.calendarId);
    return { status: 'accepted' };
  }
}
