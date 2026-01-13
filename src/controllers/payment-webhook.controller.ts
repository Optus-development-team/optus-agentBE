import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentWebhookDto } from '../dto/payment-webhook.dto';
import { X402WebhookDto, PaymentConfirmationDto } from '../dto/x402-webhook.dto';
import { SalesAgentService } from '../services/agents/subagents/sales-agent.service';
import { WhatsappService } from '../services/whatsapp/whatsapp.service';

@ApiTags('Payment Webhook')
@Controller('webhook')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly salesAgentService: SalesAgentService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Post('payments/result')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Recibe eventos del microservicio de pagos (legacy)' })
  async handlePaymentEvent(
    @Body() payload: PaymentWebhookDto,
  ): Promise<{ status: string }> {
    this.logger.log(
      `Pago webhook: ${payload.event_type} para ${payload.order_id}`,
    );
    const actions = await this.salesAgentService.handlePaymentWebhook(payload);

    for (const action of actions) {
      if (action.type === 'text' && action.text) {
        await this.whatsappService.sendTextMessage(action.to, action.text, {
          companyId: action.companyId,
        });
      } else if (action.type === 'image' && action.imageBase64) {
        await this.whatsappService.sendImageFromBase64(
          action.to,
          action.imageBase64,
          action.mimeType,
          action.caption,
          { companyId: action.companyId },
        );
      }
    }

    return { status: 'received' };
  }

  /**
   * Endpoint para recibir webhooks de x402 (pagos fiat y crypto).
   * Este endpoint es llamado por el payment backend cuando hay cambios
   * en el estado del pago.
   */
  @Post('x402/result')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Recibe eventos del flujo x402 (fiat QR y crypto)' })
  async handleX402Event(
    @Body() payload: X402WebhookDto,
  ): Promise<{ status: string }> {
    this.logger.log(
      `x402 webhook: ${payload.event} para job ${payload.jobId}`,
    );

    const actions = await this.salesAgentService.handleX402Webhook(payload);

    for (const action of actions) {
      if (action.type === 'text' && action.text) {
        await this.whatsappService.sendTextMessage(action.to, action.text, {
          companyId: action.companyId,
        });
      } else if (action.type === 'image' && action.imageBase64) {
        await this.whatsappService.sendImageFromBase64(
          action.to,
          action.imageBase64,
          action.mimeType,
          action.caption,
          { companyId: action.companyId },
        );
      }
    }

    return { status: 'received' };
  }

  /**
   * Endpoint para confirmación de pago desde la página de pago (MAIN_PAGE_URL).
   * El frontend de pago llama a este endpoint cuando el usuario confirma
   * que realizó el pago (ya sea escaneando QR o usando crypto).
   */
  @Post('payment/confirm')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Confirmación de pago desde página de pago' })
  async handlePaymentConfirmation(
    @Body() payload: PaymentConfirmationDto,
  ): Promise<{ status: string; message: string }> {
    this.logger.log(
      `Confirmación de pago recibida para orden ${payload.orderId}`,
    );

    // Buscar la orden en el SalesAgentService
    const order = this.salesAgentService.getOrderByX402JobId(payload.orderId);

    if (!order) {
      this.logger.warn(`Orden ${payload.orderId} no encontrada para confirmación`);
      return {
        status: 'not_found',
        message: 'Orden no encontrada',
      };
    }

    // Notificar al cliente que estamos verificando
    await this.whatsappService.sendTextMessage(
      order.clientPhone,
      '📱 Recibimos tu confirmación de pago. Verificando con el sistema bancario...',
      { companyId: order.companyId },
    );

    return {
      status: 'received',
      message: 'Confirmación recibida, verificando pago',
    };
  }
}
