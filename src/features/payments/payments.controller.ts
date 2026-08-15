import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('pay')
export class TransactionsController {
  constructor(private readonly supabase: SupabaseService) {}

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
      currency: string | null;
      details: string | null;
      metadata: Record<string, unknown> | null;
    }>(
      'select id, status, total_amount, currency, details, metadata from orders where id = $1 limit 1',
      [id],
    );

    const row = rows[0];
    return {
      id,
      status: row?.status ?? 'CART',
      amount: row?.total_amount ? Number(row.total_amount) : 0,
      currency: row?.currency ?? 'USDC',
      concept: row?.details ?? 'Pago pendiente',
      qrImageLink:
        (row?.metadata as { qr_image_link?: string } | null)?.qr_image_link ??
        null,
    };
  }

  @Post(':id')
  @ApiOperation({ summary: 'Inicia proceso de pago para un item especifico' })
  async createPaymentLinkForItem(
    @Param('id') itemId: string,
  ): Promise<{ orderId: string | null }> {
    if (!itemId) {
      throw new BadRequestException('itemId es requerido');
    }

    if (!this.supabase.isEnabled()) {
      throw new ServiceUnavailableException('Servicio de pagos no disponible');
    }

    const created = await this.supabase.query<{ id: string }>(
      `WITH item AS (
         SELECT id, company_id, item_type, name, sale_price, cost_price, currency
           FROM catalog_items
          WHERE id = $1
            AND is_active = true
            AND is_sellable = true
          LIMIT 1
       ),
       new_order AS (
         INSERT INTO orders (
           company_id,
           subtotal,
           total_amount,
           currency,
           status,
           payment_status,
           details,
           metadata
         )
         SELECT
           company_id,
           sale_price,
           sale_price,
           COALESCE(currency, 'USDC'),
           'PENDING_PAYMENT',
           'pending',
           CONCAT('Pago de ', name),
           jsonb_build_object(
             'source', 'pay_endpoint',
             'catalog_item_id', id
           )
         FROM item
         RETURNING id, company_id
       ),
       new_item AS (
         INSERT INTO order_items (
           order_id,
           company_id,
           item_type,
           catalog_item_id,
           item_name,
           quantity,
           unit_price,
           unit_cost,
           line_total
         )
         SELECT
           new_order.id,
           item.company_id,
           item.item_type,
           item.id,
           item.name,
           1,
           item.sale_price,
           item.cost_price,
           item.sale_price
         FROM item
         CROSS JOIN new_order
         RETURNING order_id
       )
       SELECT id FROM new_order`,
      [itemId],
    );

    const orderId = created[0]?.id ?? null;
    if (!orderId) {
      throw new NotFoundException('Producto invalido o inactivo');
    }

    return { orderId };
  }
}
