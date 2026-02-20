import { Body, Controller, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';

interface WebhookPayload {
  type: string;
  order_id?: string;
  data: Record<string, unknown>;
}

@ApiTags('webhooks')
@Controller('webhooks')
export class ExternalWebhooksController {
  private readonly logger = new Logger(ExternalWebhooksController.name);

  constructor(private readonly supabase: SupabaseService) {}

  @Post('bank-provider')
  @ApiOperation({ summary: 'Webhook de proveedor bancario (mock)' })
  async handleBank(@Body() body: WebhookPayload): Promise<{ status: string }> {
    if (body?.type !== 'QR_GENERATED') {
      this.logger.debug(
        `Webhook bancario ignorado: tipo ${body?.type ?? 'desconocido'}`,
      );
      return { status: 'ignored' };
    }

    if (!body.order_id) {
      this.logger.warn('Webhook bancario QR_GENERATED sin order_id');
      return { status: 'ignored' };
    }

    if (!this.supabase.isEnabled()) {
      this.logger.warn('Supabase no configurado; se ignora webhook bancario');
      return { status: 'ignored' };
    }

    const qrImageLink = this.extractQrLink(body.data);
    try {
      const updated = await this.supabase.query(
        `update orders set metadata = metadata || jsonb_build_object('qr_image_link', $1) where id = $2 returning id`,
        [qrImageLink, body.order_id],
      );

      if (!updated.length) {
        this.logger.warn(
          `No se encontró transacción para order_id ${body.order_id} al recibir QR_GENERATED`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error procesando webhook bancario: ${(error as Error).message}`,
      );
    }

    return { status: 'accepted' };
  }

  private extractQrLink(data: Record<string, unknown>): string | null {
    const candidate =
      (data as any)?.qr_image_ipfs_url ??
      (data as any)?.qr_image_link ??
      (data as any)?.qr_url ??
      null;
    return typeof candidate === 'string' ? candidate : null;
  }
}
