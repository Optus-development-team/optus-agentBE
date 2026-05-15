// src/common/security/x402/x402.middleware.ts
import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { 
  paymentMiddlewareFromHTTPServer, 
  x402ResourceServer, 
  x402HTTPResourceServer 
} from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

// Importación corregida de la extensión de idempotencia
import { 
  declarePaymentIdentifierExtension, 
  extractPaymentIdentifier, 
  PAYMENT_IDENTIFIER 
} from '@x402/extensions/payment-identifier';

import { SupabaseService } from '../../intraestructure/supabase/supabase.service';
import { X402IdempotencyService } from './x402-idempotency.service';

@Injectable()
export class X402DynamicMiddleware implements NestMiddleware {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly idempotencyCache: X402IdempotencyService,
    private readonly configService: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const { catalog_item_id, company_id } = req.body;

    if (!catalog_item_id || !company_id) {
      throw new HttpException('Faltan parámetros de compra requeridos', HttpStatus.BAD_REQUEST);
    }

    try {
      // 1. Obtener la definición del producto y su precio
      const { data: item, error: itemErr } = await this.supabase.client
        .from('catalog_items')
        .select('sale_price, currency, is_active')
        .eq('id', catalog_item_id)
        .single();

      if (itemErr || !item || !item.is_active) {
        throw new HttpException('Producto inválido o inactivo', HttpStatus.NOT_FOUND);
      }

      // 2. Obtener la configuración dinámica de pagos de la empresa
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

      // 3. Construir los esquemas de aceptación requeridos por x402 v2 (usando `price`)
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
          extensions: {
            [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true), // true = El cliente DEBE enviar un ID
          },
        },
      };

      // 4. Configurar el Facilitador con variables de entorno
      const facilitatorUrl = this.configService.get<string>('FACILITATOR_URL');
      
      const facilitatorClient = new HTTPFacilitatorClient({
        url: facilitatorUrl,
        // Si tu versión del SDK requiere la API key en el cliente, puedes pasar headers personalizados:
        headers: { 'Authorization': `Bearer ${this.configService.get('FACILITATOR_INTERNAL_API_KEY')}` }
      });

      // 5. Configurar el Servidor de Recursos y registrar los esquemas (EVM en este caso)
      const resourceServer = new x402ResourceServer(facilitatorClient)
        // Registramos explícitamente las redes EVM que manejas
        .register("eip155:43113", new ExactEvmScheme()) // Avalanche Fuji
        .register("eip155:84532", new ExactEvmScheme()) // Base Sepolia
        .register("eip155:2043", new ExactEvmScheme())  // ARC Testnet
        // Nota: Si usas Stellar, deberás importar e instanciar `ExactStellarScheme` y registrarlo aquí.
        
        // Hook 1: Guardar en caché después de un pago exitoso
        .onAfterSettle(async ({ paymentPayload }) => {
          const paymentId = extractPaymentIdentifier(paymentPayload);
          if (paymentId) {
            // Guardamos que el pago fue procesado. El objeto real de respuesta
            // se puede enriquecer en tu controlador.
            this.idempotencyCache.setCachedResponse(paymentId, { status: 'settled_by_x402' });
          }
        });

      // 6. Configurar el Servidor HTTP de x402
      const httpServer = new x402HTTPResourceServer(resourceServer, routes)
        // Hook 2: Verificar la caché antes de exigir un pago
        .onProtectedRequest(async (context) => {
          if (!context.paymentHeader) return;

          try {
            const paymentPayload = JSON.parse(
              Buffer.from(context.paymentHeader, "base64").toString("utf-8"),
            );
            const paymentId = extractPaymentIdentifier(paymentPayload);

            if (paymentId) {
              const cached = this.idempotencyCache.getCachedResponse(paymentId);
              // Si ya existe en caché, saltamos el proceso de pago y permitimos el acceso
              if (cached) {
                return { grantAccess: true }; 
              }
            }
          } catch {
            // Header inválido, simplemente continuamos para que x402 exija el pago
          }
        });

      // 7. Generar el middleware de Express y ejecutarlo
      const expressMiddleware = paymentMiddlewareFromHTTPServer(httpServer);
      
      return expressMiddleware(req, res, next);

    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Error al configurar pasarela de pago', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}