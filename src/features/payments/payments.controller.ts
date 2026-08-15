import {
  Body,
  Controller,
  Headers,
  Param,
  Get,
  Post,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import { TokenService } from '../../common/security/token.service';
import { NotifySuccessDto } from './dto/payment.dto';
import { ConfigService } from '@nestjs/config';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('pay')
export class TransactionsController {
  constructor(
    private readonly tokens: TokenService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene estado de link de pago' })
  async getPaymentLink(@Param('id') id: string): Promise<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    concept: string;
    qrImageLink: string | null;
  }> {
    const rows = await this.supabase.query<{
      id: string;
      status: string;
      total_amount: string | null;
      details: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      'select id, status, total_amount, details, metadata from orders where id = $1 limit 1',
      [id],
    );

    const row = rows[0];
    return {
      id,
      status: row?.status ?? 'CART',
      amount: row?.total_amount ? Number(row.total_amount) : 0,
      currency: 'USDC',
      concept: row?.details ?? 'Pago pendiente',
      qrImageLink:
        (row?.metadata as { qr_image_link?: string } | null)?.qr_image_link ??
        null,
    };
  }

  @Post(':id')
  @ApiOperation({ summary: 'Inicia proceso de pago para un item específico' })
  async createPaymentLinkForItem(
    @Param('id') id: string,
  ): Promise<{ orderId: string | null }> {
    //const { userId } = this.resolveUser(authorization);

    return ;
  }


}
