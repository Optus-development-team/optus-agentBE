// src/common/security/x402/x402.middleware.ts
import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { 
    paymentMiddleware,
    x402ResourceServer, 
} from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

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
    // 1. Instanciamos la infraestructura pesada UNA SOLA VEZ en el constructor
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

    // 2. Registramos los esquemas en el servidor de recursos de forma estática
    this.resourceServer = new x402ResourceServer(this.facilitatorClient)
      .register("eip155:43113", new ExactEvmScheme()) // Avalanche Fuji
      .register("eip155:84532", new ExactEvmScheme()) // Base Sepolia
      .register("eip155:2043", new ExactEvmScheme()); // ARC Testnet
      
    this.logger.log('X402 Middleware inicializado con esquemas EVM');
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const { catalog_item_id, company_id } = req.body;

    if (!catalog_item_id || !company_id) {
      throw new HttpException('Faltan parámetros de compra requeridos', HttpStatus.BAD_REQUEST);
    }

    try {
      // 3. Lógica dinámica que DEBE correr en cada request
      const { data: item, error: itemErr } = await this.supabase.client
        .from('catalog_items')
        .select('sale_price, currency, is_active')
        .eq('id', catalog_item_id)
        .single();

      if (itemErr || !item || !item.is_active) {
        throw new HttpException('Producto inválido o inactivo', HttpStatus.NOT_FOUND);
      }

      const { data: company, error: compErr } = await this.supabase.client
        .from('companies')
        .select('payment_settings')
        .eq('id', company_id)
        .single();

      if (compErr || !company) {
        throw new HttpException('Empresa no encontrada', HttpStatus.NOT_FOUND);
      }

      const wallets = company.payment_settings?.wallets || {};
      const acceptedNetworks = Object.keys(wallets);

      if (acceptedNetworks.length === 0) {
        throw new HttpException('La empresa no tiene métodos de pago crypto configurados', HttpStatus.BAD_REQUEST);
      }

      // 4. Construir los esquemas de aceptación requeridos por x402 v2
      const paymentAccepts = acceptedNetworks.map((network) => ({
        scheme: 'exact',
        network: network,
        price: item.sale_price.toString(), 
        payTo: wallets[network],
      }));

      // Capturamos la ruta exacta para que el middleware sepa qué proteger
      const routeKey = `${req.method} ${req.originalUrl}`; // ej: "POST /api/payments/checkout"

      const routes = {
        [routeKey]: {
          accepts: paymentAccepts,
        },
      };

      // 5. Generar el middleware pasándole la configuración dinámica y el servidor estático
      const expressMiddleware = paymentMiddleware(routes, this.resourceServer);
      
      // 6. Ceder el control
      return expressMiddleware(req, res, next);

    } catch (error) {
      this.logger.error(`Error procesando checkout en x402: ${error.message}`, error.stack);
      
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error al configurar pasarela de pago', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}