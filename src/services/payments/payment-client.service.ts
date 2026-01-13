/**
 * Cliente de pagos para integración con backend de pagos fiat.
 *
 * Responsabilidades:
 * - Warmup de sesiones bancarias
 * - Generación de QR de pago
 * - Verificación de pagos
 * - Manejo de 2FA
 *
 * @moved-from src/whatsapp/services/payment-client.service.ts
 */
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface GenerateQrResponse {
  qr_image_base64: string;
  mocked: boolean;
}

interface VerifyPaymentResponse {
  success: boolean;
  reference?: string;
  mocked: boolean;
}

interface WarmupResponse {
  requiresTwoFactor: boolean;
}

@Injectable()
export class PaymentClientService {
  private readonly logger = new Logger(PaymentClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'PAYMENT_BACKEND_URL',
      'http://payment-backend-service',
    );
    this.apiKey = this.configService.get<string>('PAYMENT_API_KEY', '');
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async warmupBankSession(companyId: string): Promise<WarmupResponse> {
    if (!this.apiKey) {
      return { requiresTwoFactor: false };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/v1/fiat/warmup`,
          { company_id: companyId },
          { headers: this.buildHeaders() },
        ),
      );

      const data = response.data as {
        requires_2fa?: boolean;
        status?: string;
      };

      return {
        requiresTwoFactor:
          Boolean(data?.requires_2fa) || data?.status === 'LOGIN_2FA_REQUIRED',
      };
    } catch (error) {
      this.logger.warn(
        `Warmup falló para ${companyId}: ${(error as Error).message}`,
      );
      return { requiresTwoFactor: false };
    }
  }

  async generateQr(
    companyId: string,
    orderId: string,
    amount: number,
    details: string,
  ): Promise<GenerateQrResponse> {
    if (!this.apiKey) {
      this.logger.warn(
        'PAYMENT_API_KEY no configurada. Retornando QR simulado.',
      );
      return {
        qr_image_base64: this.buildMockQr(orderId, amount),
        mocked: true,
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/v1/fiat/generate-qr`,
          {
            company_id: companyId,
            order_id: orderId,
            amount,
            details,
          },
          {
            headers: this.buildHeaders(),
          },
        ),
      );

      this.logger.log(`QR generado para la orden ${orderId}`);
      const qr = (response.data as { qr_image_base64?: string })
        ?.qr_image_base64;
      return {
        qr_image_base64: qr ?? this.buildMockQr(orderId, amount),
        mocked: !qr,
      };
    } catch (error) {
      this.logger.error('Fallo generando QR, usando modo mock', error as Error);
      return {
        qr_image_base64: this.buildMockQr(orderId, amount),
        mocked: true,
      };
    }
  }

  async verifyPayment(
    companyId: string,
    orderId: string,
    details: string,
  ): Promise<VerifyPaymentResponse> {
    if (!this.apiKey) {
      this.logger.warn(
        'PAYMENT_API_KEY no configurada. Verificación simulada.',
      );
      return { success: true, reference: `MOCK-${orderId}`, mocked: true };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/v1/fiat/verify-payment`,
          {
            company_id: companyId,
            order_id: orderId,
            details,
          },
          {
            headers: this.buildHeaders(),
          },
        ),
      );

      const payload = response.data as { success?: boolean; ref?: string };
      return {
        success: Boolean(payload.success),
        reference: payload.ref,
        mocked: false,
      };
    } catch (error) {
      this.logger.error('Error verificando pago', error as Error);
      return { success: false, mocked: true };
    }
  }

  async submitTwoFactor(companyId: string, code: string): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(
        'PAYMENT_API_KEY no configurada. Ignorando envío de 2FA.',
      );
      return true;
    }

    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/v1/fiat/set-2fa`,
          { code, company_id: companyId },
          { headers: this.buildHeaders() },
        ),
      );
      return true;
    } catch (error) {
      this.logger.error('Error enviando código 2FA', error as Error);
      return false;
    }
  }

  private buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-internal-api-key': this.apiKey,
    };
  }

  private buildMockQr(orderId: string, amount: number): string {
    const payload = `MOCK_QR|ORDER:${orderId}|AMOUNT:${amount}`;
    return Buffer.from(payload, 'utf8').toString('base64');
  }
}
