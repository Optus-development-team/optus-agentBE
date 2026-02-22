import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../../../common/intraestructure/supabase/supabase.service';
import {
  StickerEventKey,
  STICKER_EVENT_ENV_MAP,
} from '../types/sticker-events.types';

@Injectable()
export class CompanyStickerService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

  async getStickerUrl(
    companyId: string | undefined,
    eventKey: StickerEventKey,
  ): Promise<string> {
    if (companyId) {
      const rows = await this.supabase.query<{ sticker_url: string }>(
        `SELECT sticker_url
           FROM public.company_whatsapp_stickers
          WHERE company_id = $1
            AND event_key = $2
            AND is_active = true
          LIMIT 1`,
        [companyId, eventKey],
      );

      const dbSticker = rows[0]?.sticker_url?.trim();
      if (dbSticker) {
        return dbSticker;
      }
    }

    const envKey = STICKER_EVENT_ENV_MAP[eventKey];
    const envSticker = this.configService.get<string>(envKey, '').trim();
    if (envSticker) {
      return envSticker;
    }

    return this.buildPlaceholder(eventKey);
  }

  private buildPlaceholder(eventKey: StickerEventKey): string {
    const label = eventKey.replace(/_/g, ' ');
    return `https://placehold.co/512x512/EEE/31343C.webp?font=raleway&text=${encodeURIComponent(label)}`;
  }
}
