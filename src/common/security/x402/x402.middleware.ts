// src/common/security/x402/x402.middleware.ts
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { ExactStellarScheme } from '@x402/stellar/exact/server';


import { SupabaseService } from '../../intraestructure/supabase/supabase.service';

@Injectable()
export class X402DynamicMiddleware implements NestMiddleware {
  private readonly logger = new Logger(X402DynamicMiddleware.name);
  private readonly facilitatorClient: HTTPFacilitatorClient;
  private readonly resourceServer: x402ResourceServer;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly configService: ConfigService,
  ) {
    const facilitatorUrl = this.configService.get<string>('FACILITATOR_URL');
    const facilitatorApiKey = this.configService.get<string>('FACILITATOR_INTERNAL_API_KEY');

    this.facilitatorClient = new HTTPFacilitatorClient({
      url: facilitatorUrl,
      createAuthHeaders: async () => ({
        verify: { Authorization: `Bearer ${facilitatorApiKey}` },
        settle: { Authorization: `Bearer ${facilitatorApiKey}` },
        supported: { Authorization: `Bearer ${facilitatorApiKey}` },
      }),
    });

    this.resourceServer = new x402ResourceServer(this.facilitatorClient)
      .register('eip155:43113', new ExactEvmScheme())
      .register('eip155:84532', new ExactEvmScheme())
      .register('eip155:2043', new ExactEvmScheme())
      .register('stellar:testnet', new ExactStellarScheme());

    this.logger.log('X402 Middleware inicializado con esquemas EVM');
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const itemId = req.params.itemId;

    if (!itemId) {
      throw new BadRequestException('itemId es requerido');
    }

    if (!this.supabase.isEnabled()) {
      throw new InternalServerErrorException('Servicio de pagos no disponible');
    }

    try {
      const [item] = await this.supabase.query<{
        sale_price: number | string;
        company_id: string;
        is_active: boolean;
      }>(
        `select sale_price, company_id, is_active
           from catalog_items
          where id = $1
          limit 1`,
        [itemId],
      );

      if (!item || !item.is_active) {
        throw new NotFoundException('Producto inválido o inactivo');
      }

      const [company] = await this.supabase.query<{
        payment_settings: { wallets?: Record<string, string> } | null;
      }>(
        `select payment_settings
           from companies
          where id = $1
          limit 1`,
        [item.company_id],
      );

      if (!company) {
        throw new NotFoundException('Empresa no encontrada');
      }

      const wallets = company.payment_settings?.wallets ?? {};
      const acceptedNetworks = Object.keys(
        wallets,
      ) as Array<`${string}:${string}`>;

      if (acceptedNetworks.length === 0) {
        throw new BadRequestException(
          'La empresa no tiene métodos de pago crypto configurados',
        );
      }

      const paymentAccepts = acceptedNetworks.map((network) => ({
        scheme: 'exact' as const,
        network,
        price: String(item.sale_price),
        payTo: wallets[network],
      }));

      const routeConfig: Parameters<typeof paymentMiddleware>[0] = {
        accepts: paymentAccepts,
      };

      const expressMiddleware = paymentMiddleware(routeConfig, this.resourceServer);

      return expressMiddleware(req, res, next);
    } catch (error) {
      const safeError = error as Error;
      this.logger.error(
        `Error procesando checkout en x402: ${safeError.message}`,
        safeError.stack,
      );

      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'Error al configurar pasarela de pago',
      );
    }
  }
}