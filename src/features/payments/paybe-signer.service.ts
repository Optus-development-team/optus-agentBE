import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type {
  GasPaymentDto,
  PaybeSignatureData,
  PaybeStandardResponse,
} from './types/paybe.types';

@Injectable()
export class PaybeSignerService {
  private readonly logger = new Logger(PaybeSignerService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>(
      'PAYBE_BASE_URL',
      'http://pay-be-internal:3000',
    );
    this.apiKey = config.get<string>('PAYBE_INTERNAL_API_KEY', '');
  }

  async sponsorGas(params: {
    transactionBytes: string;
    sender: string;
    gasPayments?: GasPaymentDto[];
  }): Promise<PaybeSignatureData> {
    const url = new URL('/v1/signer/sponsor-gas', this.baseUrl);

    const response = await firstValueFrom(
      this.http.post<PaybeStandardResponse<PaybeSignatureData>>(
        url.toString(),
        params,
        {
          headers: this.buildHeaders(),
          validateStatus: () => true,
        },
      ),
    );

    const body = response.data;
    const payload = body?.data;

    if (response.status !== 200 || body?.success === false || !payload) {
      const message =
        body?.message ?? 'No se pudo obtener la firma del sponsor';
      this.logger.error(
        `PayBE respondió ${response.status}: ${JSON.stringify(response.data)}`,
      );
      throw new Error(message);
    }

    return payload;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['x-internal-api-key'] = this.apiKey;
    }
    return headers;
  }
}
