import type { ConfigService } from '@nestjs/config';
import type { SupabaseService } from '../../../../../common/intraestructure/supabase/supabase.service';
import type { StickerEventKey } from '../types/sticker-events.types';
import { STICKER_EVENT_ENV_MAP } from '../types/sticker-events.types';

export interface CompanyStickerLookupParams {
  supabase: SupabaseService;
  configService: ConfigService;
  companyId?: string;
  eventKey: StickerEventKey;
}

export async function getStickerUrlForEvent(
  params: CompanyStickerLookupParams,
): Promise<string> {
  if (params.companyId) {
    const rows = await params.supabase.query<{ sticker_url: string }>(
      `SELECT sticker_url
         FROM public.company_whatsapp_stickers
        WHERE company_id = $1
          AND event_key = $2
          AND is_active = true
        LIMIT 1`,
      [params.companyId, params.eventKey],
    );

    const dbSticker = rows[0]?.sticker_url?.trim();
    if (dbSticker) {
      return dbSticker;
    }
  }

  const envKey = STICKER_EVENT_ENV_MAP[params.eventKey];
  const envSticker = params.configService.get<string>(envKey, '').trim();
  if (envSticker) {
    return envSticker;
  }

  return buildPlaceholder(params.eventKey);
}

function buildPlaceholder(eventKey: StickerEventKey): string {
  const label = eventKey.replace(/_/g, ' ');
  return `https://placehold.co/512x512/EEE/31343C.webp?font=raleway&text=${encodeURIComponent(label)}`;
}
