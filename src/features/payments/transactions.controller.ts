import {
  Body,
  Controller,
  Headers,
  Param,
  Get,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import { TokenService } from '../../common/security/token.service';
import { NotifySuccessDto } from './dto/tx.dto';
import { ConfigService } from '@nestjs/config';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('tx')
export class TransactionsController {
  constructor(
    private readonly tokens: TokenService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  @Post('notify-success')
  @ApiOperation({ summary: 'Marca transaccion confirmada con referencia externa' })
  @ApiOkResponse({ description: 'Registro actualizado o creado' })
  async notifySuccess(
    @Headers('authorization') authorization: string,
    @Body() body: NotifySuccessDto,
  ): Promise<{ updated: boolean }> {
    const { userId } = this.resolveUser(authorization);
    const orderId = await this.findLatestOrderId(userId);
    if (orderId) {
      await this.supabase.query(
        `update orders
            set status = 'PAID',
                metadata = metadata || jsonb_build_object('payment_reference', $2)
          where id = $1`,
        [orderId, body.transactionReference],
      );
    } else {
      await this.recordTransaction({
        userId,
        type: 'CONTRIBUTION',
        method: 'EXTERNAL_PAYMENT',
        paymentReference: body.transactionReference,
      });
    }

    return { updated: true };
  }

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

  private async recordTransaction(params: {
    userId: string;
    type: string;
    method: string;
    paymentReference: string | null;
  }): Promise<string | null> {
    const companyId = this.config.get<string>('DEFAULT_COMPANY_ID');
    if (!companyId || !this.supabase.isEnabled()) return null;

    const rows = await this.supabase.query<{ id: string }>(
      `insert into orders (company_id, user_id, total_amount, status, details, metadata)
       values ($1, $2, $3, $4, $5, $6::jsonb)
       returning id`,
      [
        companyId,
        params.userId,
        0,
        'PENDING_PAYMENT',
        params.type,
        {
          type: params.type,
          method: params.method,
          payment_reference: params.paymentReference,
        },
      ],
    );

    return rows[0]?.id ?? null;
  }

  private async findLatestOrderId(userId: string): Promise<string | null> {
    const companyId = this.config.get<string>('DEFAULT_COMPANY_ID');
    if (!companyId || !this.supabase.isEnabled()) return null;

    const rows = await this.supabase.query<{ id: string }>(
      `select id from orders where company_id = $1 and user_id = $2 order by created_at desc limit 1`,
      [companyId, userId],
    );

    return rows[0]?.id ?? null;
  }

  private resolveUser(authorization?: string): { userId: string } {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header inválido');
    }
    const token = authorization.slice('Bearer '.length).trim();
    const payload = this.tokens.verifyToken(token);
    return { userId: payload.userId };
  }
}
