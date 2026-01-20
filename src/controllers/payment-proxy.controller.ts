import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Response } from 'express';
import { SalesAgentService } from '../services/agents/subagents/sales-agent.service';
import { WhatsappService } from '../services/whatsapp/whatsapp.service';
import type { PaymentWebhookAction } from '../dto/payment-webhook.dto';

interface XPaymentPayload {
  orderId?: string;
  details?: string;
  x402Version?: number;
  scheme?: string;
  network?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

@ApiTags('Payment Proxy')
@Controller('api')
export class PaymentProxyController {
  private readonly logger = new Logger(PaymentProxyController.name);
  private readonly paymentBackendUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly salesAgentService: SalesAgentService,
    private readonly whatsappService: WhatsappService,
  ) {
    this.paymentBackendUrl = this.configService.get<string>(
      'PAYMENT_BACKEND_URL',
      'http://localhost:3001',
    );
  }

  @Get('pay')
  @ApiOperation({
    summary: 'Proxy para reenviar X-PAYMENT al backend de pagos (main page)',
  })
  async forwardPayRequest(
    @Headers('x-payment') xPaymentHeader: string | undefined,
    @Query() query: Record<string, string | string[]>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    const timestamp = new Date().toISOString();
    const targetUrl = this.buildTargetUrl(query);
    const headers: Record<string, string> = {};

    // Log detallado de la petición desde MAIN_PAGE
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log(`📥 Petición desde MAIN_PAGE [${timestamp}]`);
    this.logger.log(`🔗 Query Params: ${JSON.stringify(query, null, 2)}`);
    this.logger.log(`📦 Header X-PAYMENT presente: ${!!xPaymentHeader}`);

    let extractedOrderId: string | undefined;
    let extractedDetails: string | undefined;
    let headerToForward = xPaymentHeader;

    if (xPaymentHeader) {
      const decoded = this.decodeXPayment(xPaymentHeader);
      if (decoded) {
        extractedOrderId =
          typeof decoded.orderId === 'string' ? decoded.orderId : undefined;
        extractedDetails =
          typeof decoded.details === 'string' ? decoded.details : undefined;
        this.logger.log(
          `📄 X-PAYMENT decodificado: ${JSON.stringify(decoded, null, 2)}`,
        );

        if (
          decoded.x402Version &&
          decoded.payload &&
          (decoded.orderId || decoded.details)
        ) {
          const sanitizedPayload = { ...decoded };
          delete sanitizedPayload.orderId;
          delete sanitizedPayload.details;
          headerToForward = Buffer.from(
            JSON.stringify(sanitizedPayload),
            'utf8',
          ).toString('base64');
          this.logger.log(
            '🔧 Ajustando X-PAYMENT para compatibilidad X402 (se remueven orderId/details).',
          );
        }
      }

      if (headerToForward) {
        headers['X-PAYMENT'] = headerToForward;
      }
    }

    this.logger.log(`🎯 Target URL: ${targetUrl}`);
    this.logger.debug(`Reenviando GET ${targetUrl} hacia backend de pagos`);

    try {
      const orderIdFromQuery = this.extractQueryParam(query, 'orderId');
      const detailsFromQuery =
        this.extractQueryParam(query, 'details') ??
        this.extractQueryParam(query, 'description');

      const response = await firstValueFrom(
        this.httpService.get(targetUrl, {
          headers,
          validateStatus: () => true,
          timeout: 60000, // 60 segundos para operaciones de pago desde frontend
        }),
      );

      if (
        response.status === HttpStatus.OK &&
        (headerToForward || orderIdFromQuery)
      ) {
        await this.handleSuccessfulPayment(
          extractedOrderId ?? orderIdFromQuery,
          extractedDetails ?? detailsFromQuery,
        );
      }

      const paymentResponseHeader =
        response.headers?.['x-payment-response'] ??
        response.headers?.['X-PAYMENT-RESPONSE'];

      // Log detallado de la respuesta
      this.logger.log(
        `📤 Respuesta del backend de pagos - Status: ${response.status}`,
      );
      this.logger.log(
        `📦 Header X-PAYMENT-RESPONSE presente: ${!!paymentResponseHeader}`,
      );

      if (paymentResponseHeader) {
        const value = Array.isArray(paymentResponseHeader)
          ? paymentResponseHeader.join(',')
          : paymentResponseHeader;
        res.setHeader('X-PAYMENT-RESPONSE', value);

        try {
          const decoded = JSON.parse(
            Buffer.from(value, 'base64').toString('utf8'),
          );
          this.logger.log(
            `📄 X-PAYMENT-RESPONSE decodificado: ${JSON.stringify(decoded, null, 2)}`,
          );
        } catch (err) {
          this.logger.warn(
            `⚠️  No se pudo decodificar X-PAYMENT-RESPONSE: ${err.message}`,
          );
        }
      }

      this.logger.log(
        `📊 Body response: ${JSON.stringify(response.data).substring(0, 500)}`,
      );
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (response.status === HttpStatus.OK) {
        return response.data;
      }

      throw new HttpException(response.data, response.status);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error & {
        response?: { data?: unknown; status?: number };
      };
      const status = err.response?.status ?? HttpStatus.BAD_GATEWAY;
      const body = err.response?.data ?? err.message;
      this.logger.error('Error reenviando petición a backend de pagos', err);
      throw new HttpException(body, status);
    }
  }

  private buildTargetUrl(query: Record<string, string | string[]>): string {
    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          params.append(key, entry);
        });
      } else if (value !== undefined) {
        params.append(key, value);
      }
    });

    const queryString = params.toString();
    const base = `${this.paymentBackendUrl}/api/pay`;
    return queryString ? `${base}?${queryString}` : base;
  }

  private async handleSuccessfulPayment(
    orderId?: string,
    details?: string,
  ): Promise<void> {
    if (!orderId) {
      this.logger.warn(
        'Confirmación de pago recibida sin orderId. No se actualizará ninguna orden.',
      );
      return;
    }

    const actions = await this.salesAgentService.confirmOrderFromProxy(
      orderId,
      details,
    );

    if (!actions.length) {
      return;
    }

    await this.dispatchActions(actions);
  }

  private decodeXPayment(header: string): XPaymentPayload | null {
    try {
      const raw = Buffer.from(header, 'base64').toString('utf8');
      return JSON.parse(raw) as XPaymentPayload;
    } catch (error) {
      this.logger.error(
        'No se pudo decodificar el header X-PAYMENT',
        error as Error,
      );
      return null;
    }
  }

  private extractQueryParam(
    query: Record<string, string | string[]>,
    key: string,
  ): string | undefined {
    const value = query[key];
    if (Array.isArray(value)) {
      return value[0];
    }
    return typeof value === 'string' ? value : undefined;
  }

  private async dispatchActions(
    actions: PaymentWebhookAction[],
  ): Promise<void> {
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
  }
}
