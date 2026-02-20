import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { ZkProofRequestDto } from './dto/proving.dto';
import type {
  ProvingPingResponse,
  ProvingProofResponse,
} from './types/proving.types';

@Injectable()
export class ProvingService {
  private readonly logger = new Logger(ProvingService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    const rawUrl = this.config.get<string>('PROVING_SERVICE_API_URL')?.trim();
    let normalized = rawUrl ? rawUrl.replace(/\/+$/, '') : '';
    if (normalized && !normalized.endsWith('/v1')) {
      normalized = `${normalized}/v1`;
    }
    this.baseUrl = normalized;
  }

  private ensureConfigured(): void {
    if (!this.baseUrl) {
      throw new InternalServerErrorException(
        'No se configuró PROVING_SERVICE_API_URL',
      );
    }
  }

  async requestProof(body: ZkProofRequestDto): Promise<ProvingProofResponse> {
    this.ensureConfigured();
    try {
      const response = await firstValueFrom(
        this.http.post<ProvingProofResponse>(this.baseUrl, body, {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        'Error obteniendo prueba zk del Proving Service',
        error as Error,
      );
      throw new InternalServerErrorException(
        'No se pudo obtener la prueba zk desde el Proving Service',
      );
    }
  }

  async ping(): Promise<ProvingPingResponse> {
    this.ensureConfigured();
    try {
      const response = await firstValueFrom(
        this.http.get<ProvingPingResponse>(`${this.baseUrl}/ping`),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        'Error haciendo ping al Proving Service',
        error as Error,
      );
      throw new InternalServerErrorException('El Proving Service no responde');
    }
  }
}
