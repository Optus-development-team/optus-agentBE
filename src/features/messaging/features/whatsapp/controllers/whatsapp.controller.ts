import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { WhatsappService } from '../services/whatsapp.webhook.controller.service';

@ApiTags('WhatsApp Webhook')
@Controller('webhooks/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  /**
   * GET /webhook - Verificación del webhook por parte de WhatsApp
   * Este endpoint es llamado por WhatsApp para verificar tu webhook
   */
  @Get()
  @ApiOperation({
    summary: 'Verifica la suscripción del webhook con Meta',
    description:
      'Meta ejecuta este endpoint para confirmar que el webhook es válido. Debe devolver el challenge recibido cuando el token coincide.',
  })
  @ApiQuery({ name: 'hub.mode', required: true, example: 'subscribe' })
  @ApiQuery({ name: 'hub.verify_token', required: true })
  @ApiQuery({ name: 'hub.challenge', required: true })
  @ApiOkResponse({
    description: 'Challenge devuelto exitosamente',
    schema: { type: 'string' },
  })
  @ApiBadRequestResponse({ description: 'Verificación fallida' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    this.logger.log('Verificación de webhook solicitada');

    const result = this.whatsappService.verifyWebhook(mode, token, challenge);

    if (!result) {
      throw new BadRequestException('Verificación fallida');
    }

    return result;
  }

  /**
   * POST /webhook - Recepción de webhooks de WhatsApp
   * Este endpoint es llamado por WhatsApp para notificar de eventos entrantes (mensajes, cambios de estado, etc.)
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recibe eventos entrantes de WhatsApp' })
  @ApiOkResponse({
    description: 'Evento procesado correctamente',
    schema: { example: { status: 'success' } },
  })
  async receiveWebhook(
    @Body() body: Record<string, unknown>,
  ): Promise<{ status: string }> {
    this.logger.log('Webhook recibido');
    this.logger.log(body);

    try {
      await this.whatsappService.processIncomingWebhook(body);

      return { status: 'success' };
    } catch (error) {
      const safeError = error as Error & { stack?: string };
      this.logger.error('Error procesando webhook:', safeError.message);
      this.logger.error('Stack trace:', safeError.stack);
      this.logger.error('Body recibido:', JSON.stringify(body, null, 2));
      // Respondemos con éxito aunque haya errores para no perder mensajes
      return { status: 'error' };
    }
  }
}
