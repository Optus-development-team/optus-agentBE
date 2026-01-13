/**
 * Cliente de pagos x402 para integración con protocolo de pago HTTP 402.
 *
 * Responsabilidades:
 * - Iniciar flujos de pago x402
 * - Verificar pagos fiat/crypto
 * - Gestionar sesiones de negociación
 *
 * @moved-from src/whatsapp/services/x402-payment-client.service.ts
 */
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Estructura de un método de pago aceptado (fiat o crypto)
 */
export interface X402AcceptOption {
  /** Tipo de pago: fiat o crypto */
  type: 'fiat' | 'crypto';
  /** Moneda (BOB, USDC, etc.) */
  currency?: string;
  /** Símbolo de moneda (Bs., $, etc.) */
  symbol?: string;
  /** Monto requerido */
  amountRequired?: number;
  /** QR en base64 (solo fiat) */
  base64QrSimple?: string;
  /** Scheme crypto (exact, upto) */
  scheme?: string;
  /** Network crypto (base-sepolia, etc.) */
  network?: string;
  /** Dirección de pago crypto */
  payTo?: string;
  /** Monto atomico crypto */
  maxAmountRequired?: string;
}

/**
 * Respuesta del endpoint GET /api/pay en fase de negociación (402)
 */
export interface X402NegotiationResponse {
  x402Version: number;
  resource: string;
  accepts: X402AcceptOption[];
  error?: string;
  jobId: string;
}

/**
 * Respuesta de settlement exitoso (200 OK)
 */
export interface X402SettlementResponse {
  success: boolean;
  type: 'fiat' | 'crypto';
  transaction?: string | null;
  currency?: string;
  network?: string;
  chainId?: number;
  payer?: string;
  errorReason?: string | null;
}

/**
 * Resultado unificado de la solicitud de pago
 */
export interface X402PaymentResult {
  /** true si se obtuvo respuesta válida del servidor */
  ok: boolean;
  /** Si está en fase de negociación (402), contiene las opciones */
  negotiation?: X402NegotiationResponse;
  /** Si hubo settlement exitoso (200), contiene el resultado */
  settlement?: X402SettlementResponse;
  /** ID del job para tracking */
  jobId?: string;
  /** QR decodificado si estaba presente en fiat option */
  qrImageBase64?: string;
  /** URL de pago construida con MAIN_PAGE_URL */
  paymentUrl?: string;
  /** Error HTTP o de red */
  error?: string;
}

@Injectable()
export class X402PaymentClientService {
  private readonly logger = new Logger(X402PaymentClientService.name);
  private readonly baseUrl: string;
  private readonly mainPageUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'PAYMENT_BACKEND_URL',
      'http://localhost:3001',
    );
    this.mainPageUrl = this.configService.get<string>(
      'MAIN_PAGE_URL',
      'https://optus.lat',
    );
  }

  isEnabled(): boolean {
    return Boolean(this.baseUrl);
  }

  /**
   * Inicia el flujo de pago llamando a GET /api/pay sin X-PAYMENT header.
   * Esto devuelve 402 con las opciones de pago disponibles (fiat QR y/o crypto).
   */
  async initiatePayment(params: {
    orderId: string;
    amountUsd: number;
    description?: string;
    resource?: string;
    fiatAmount?: number;
    currency?: string;
    symbol?: string;
  }): Promise<X402PaymentResult> {
    try {
      const queryParams = new URLSearchParams({
        orderId: params.orderId,
        amountUsd: params.amountUsd.toString(),
      });

      if (params.description) {
        queryParams.append('description', params.description);
      }
      if (params.resource) {
        queryParams.append('resource', params.resource);
      }
      if (params.fiatAmount !== undefined) {
        queryParams.append('fiatAmount', params.fiatAmount.toString());
      }
      if (params.currency) {
        queryParams.append('currency', params.currency);
      }
      if (params.symbol) {
        queryParams.append('symbol', params.symbol);
      }

      const url = `${this.baseUrl}/api/pay?${queryParams.toString()}`;

      this.logger.debug(`Iniciando pago x402: ${url}`);

      // Esperamos un 402 Payment Required
      const response = await firstValueFrom(
        this.httpService.get<X402NegotiationResponse>(url, {
          validateStatus: (status) => status === 402 || status === 200,
          timeout: 30000,
        }),
      );

      const data = response.data;

      if (response.status === 402) {
        // Fase de negociación - extraer opciones
        const fiatOption = data.accepts?.find((opt) => opt.type === 'fiat');
        const qrImageBase64 = fiatOption?.base64QrSimple;

        // Construir URL de pago con MAIN_PAGE_URL
        const paymentUrl = `${this.mainPageUrl}/pago/${params.orderId}`;

        this.logger.log(
          `Pago x402 iniciado para orden ${params.orderId}. Job ID: ${data.jobId}`,
        );

        return {
          ok: true,
          negotiation: data,
          jobId: data.jobId,
          qrImageBase64,
          paymentUrl,
        };
      }

      // Si llegamos aquí con 200, es settlement directo
      return {
        ok: true,
        settlement: data as unknown as X402SettlementResponse,
        jobId: data.jobId,
      };
    } catch (error) {
      const err = error as Error & { response?: { data?: unknown } };
      const details = err.response?.data ?? err.message;
      this.logger.error('Error iniciando pago x402:', details);

      return {
        ok: false,
        error: typeof details === 'string' ? details : JSON.stringify(details),
      };
    }
  }

  /**
   * Verifica un pago fiat enviando el payload al header X-PAYMENT.
   */
  async verifyFiatPayment(params: {
    orderId: string;
    amountUsd: number;
    details: string;
  }): Promise<X402PaymentResult> {
    try {
      const xPaymentPayload = {
        orderId: params.orderId,
        details: params.details,
      };

      const xPaymentHeader = Buffer.from(
        JSON.stringify(xPaymentPayload),
        'utf8',
      ).toString('base64');

      const queryParams = new URLSearchParams({
        orderId: params.orderId,
        amountUsd: params.amountUsd.toString(),
      });

      const url = `${this.baseUrl}/api/pay?${queryParams.toString()}`;

      this.logger.debug(`Verificando pago fiat x402: ${url}`);

      const response = await firstValueFrom(
        this.httpService.get<X402SettlementResponse | X402NegotiationResponse>(
          url,
          {
            headers: {
              'X-PAYMENT': xPaymentHeader,
            },
            validateStatus: (status) => status === 200 || status === 402,
            timeout: 45000,
          },
        ),
      );

      if (response.status === 200) {
        const settlement = response.data as X402SettlementResponse;
        this.logger.log(
          `Pago fiat verificado para orden ${params.orderId}: ${settlement.success}`,
        );

        return {
          ok: true,
          settlement,
        };
      }

      // 402 = verificación fallida
      const negotiation = response.data as X402NegotiationResponse;
      this.logger.warn(
        `Verificación fiat fallida para ${params.orderId}: ${negotiation.error}`,
      );

      return {
        ok: true,
        negotiation,
        jobId: negotiation.jobId,
      };
    } catch (error) {
      const err = error as Error & { response?: { data?: unknown } };
      const details = err.response?.data ?? err.message;
      this.logger.error('Error verificando pago fiat x402:', details);

      return {
        ok: false,
        error: typeof details === 'string' ? details : JSON.stringify(details),
      };
    }
  }

  /**
   * Construye la URL de pago para el cliente.
   */
  buildPaymentUrl(orderId: string): string {
    return `${this.mainPageUrl}/pay/${orderId}`;
  }

  /**
   * Decodifica el QR base64 simple del x402 response.
   */
  decodeQrBase64(base64QrSimple: string): string {
    return base64QrSimple;
  }
}
