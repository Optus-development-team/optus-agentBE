import { Injectable, Logger } from '@nestjs/common';
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { z } from 'zod';
import { SupabaseService } from '../../../../../common/intraestructure/supabase/supabase.service';
import {
  SYSTEM_EVENT_CHANNEL,
  SystemEventType,
  type SystemNotificationEvent,
} from '../../../../../common/events/system-events.types';

@Injectable()
export class SalesToolsService {
  private readonly logger = new Logger('SalesTools');

  constructor(
    private readonly supabase: SupabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

/*   get searchProductsTool(): FunctionTool {
    return new FunctionTool({
      name: 'search_products',
      description:
        'Busca productos en el catálogo de la empresa por nombre, categoría o descripción. ' +
        'Usa esta herramienta cuando el usuario pregunte por productos específicos.',
      parameters: z.object({
        query: z
          .string()
          .describe(
            'Término de búsqueda (nombre del producto, categoría, etc.)',
          ),
        category: z
          .string()
          .optional()
          .describe('Filtrar por categoría específica'),
        maxResults: z
          .number()
          .optional()
          .describe('Número máximo de resultados (default: 5)'),
      }),
      execute: async (args, context?: ToolContext) => {
        this.logger.debug(`Buscando productos: ${args.query}`);

        const state = context?.state;
        const companyId = state?.get('app:companyId') as string | undefined;

        return {
          success: true,
          products: [
            {
              id: 'PROD-001',
              name: `Producto relacionado a "${args.query}"`,
              price: 100.0,
              currency: 'USD',
              available: true,
              stock: 10,
            },
          ],
          message: `Encontré productos relacionados con "${args.query}" para la empresa ${companyId || 'desconocida'}`,
        };
      },
    });
  }

  get getProductInfoTool(): FunctionTool {
    return new FunctionTool({
      name: 'get_product_info',
      description:
        'Obtiene información detallada de un producto específico por su ID o SKU. ' +
        'Incluye precio, stock disponible, descripción y más.',
      parameters: z.object({
        productId: z.string().describe('ID único o SKU del producto'),
      }),
      execute: async (args, _context?: ToolContext) => {
        this.logger.debug(`Obteniendo info del producto: ${args.productId}`);

        return {
          success: true,
          product: {
            id: args.productId,
            name: 'Producto de ejemplo',
            description: 'Descripción detallada del producto',
            price: 250.0,
            currency: 'USD',
            stock: 15,
            available: true,
            category: 'General',
          },
        };
      },
    });
  } */

  get createPaymentOrderTool(): FunctionTool {
    return new FunctionTool({
      name: 'create_payment_order',
      description:
        'Crea una nueva orden de pago para el usuario. ' +
        'Genera un código QR o link de pago según el método configurado.',
      parameters: z.object({
        amount: z.number().describe('Monto total a pagar'),
        description: z
          .string()
          .optional()
          .describe('Descripción o concepto del pago'),
        products: z
          .array(
            z.object({
              productId: z.string(),
              quantity: z.number(),
            }),
          )
          .optional()
          .describe('Lista de productos (si aplica)'),
      }),
      execute: async (args, context?: ToolContext) => {
        this.logger.debug(`Creando orden de pago: $${args.amount}`);

        const state = context?.state;
        const companyId = state?.get('app:companyId') as string | undefined;
        const senderPhone = state?.get('user:phone') as string | undefined;

        this.emitToolTriggered(companyId, 'create_payment_order');

        const orderId = `ORD-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}`;

        if (companyId && this.supabase.isEnabled()) {
          const created = await this.supabase.query<{ id: string }>(
            `insert into orders (company_id, user_id, total_amount, status, details, metadata)
             values ($1, $2, $3, $4, $5, $6::jsonb)
             returning id`,
            [
              companyId,
              senderPhone ?? null,
              args.amount,
              'PENDING_PAYMENT',
              args.description ?? 'Orden creada por sales tool',
              {
                source: 'sales_tool',
                products: args.products ?? [],
              },
            ],
          );

          const insertedOrderId = created[0]?.id;
          if (insertedOrderId) {
            this.emitCompanyEvent(companyId, {
              type: SystemEventType.SALES_ORDER_REGISTERED,
              payload: {
                orderId: insertedOrderId,
                amount: args.amount,
              },
            });
          }
        }

        return {
          success: true,
          orderId,
          amount: args.amount,
          currency: state?.get('app:currency') || 'USD',
          status: 'pending',
          companyId,
          paymentUrl: `https://pay.example.com/${orderId}`,
          message: `Orden de pago ${orderId} creada por $${args.amount}. Escanea el QR o usa el link para pagar.`,
        };
      },
    });
  }

  get checkPaymentStatusTool(): FunctionTool {
    return new FunctionTool({
      name: 'check_payment_status',
      description:
        'Verifica el estado actual de una orden de pago. ' +
        'Puede confirmar si ya fue pagada, está pendiente o tiene algún error.',
      parameters: z.object({
        orderId: z
          .string()
          .optional()
          .describe(
            'ID de la orden a verificar. Si no se proporciona, busca la más reciente.',
          ),
      }),
      execute: async (args, context?: ToolContext) => {
        const state = context?.state;
        const orderId =
          args.orderId || (state?.get('temp:lastOrderId') as string);
        const companyId = state?.get('app:companyId') as string | undefined;

        this.emitToolTriggered(companyId, 'check_payment_status');

        if (!orderId) {
          return {
            success: false,
            message:
              'No se especificó ID de orden y no hay orden reciente en la sesión.',
          };
        }

        this.logger.debug(`Verificando pago de orden: ${orderId}`);

        return {
          success: true,
          orderId,
          status: 'pending',
          amount: 100.0,
          currency: 'USD',
          paidAt: null,
          message: `La orden ${orderId} está pendiente de pago.`,
        };
      },
    });
  }

  get generatePaymentQrTool(): FunctionTool {
    return new FunctionTool({
      name: 'generate_payment_qr',
      description:
        'Genera o regenera el código QR de pago para una orden específica. ' +
        'El QR puede ser escaneado con aplicaciones bancarias.',
      parameters: z.object({
        orderId: z.string().describe('ID de la orden para generar QR'),
        regenerate: z
          .boolean()
          .optional()
          .describe('Forzar regeneración del QR'),
      }),
      execute: async (args, _context?: ToolContext) => {
        const companyId = _context?.state?.get('app:companyId') as
          | string
          | undefined;
        this.emitToolTriggered(companyId, 'generate_payment_qr');

        this.logger.debug(`Generando QR para orden: ${args.orderId}`);

        return {
          success: true,
          orderId: args.orderId,
          qrUrl: `https://ipfs.example.com/qr/${args.orderId}.png`,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          message: `QR generado para la orden ${args.orderId}. Válido por 30 minutos.`,
        };
      },
    });
  }

  get syncInventoryTool(): FunctionTool {
    return new FunctionTool({
      name: 'sync_inventory',
      description:
        'Sincroniza el inventario entre el catálogo de Meta y la base de datos. ' +
        'Solo disponible para administradores.',
      parameters: z.object({
        direction: z
          .enum(['to_meta', 'from_meta', 'both'])
          .optional()
          .describe('Dirección de sincronización'),
      }),
      execute: async (args, context?: ToolContext) => {
        const state = context?.state;
        const userRole = state?.get('user:role') as string | undefined;
        const companyId = state?.get('app:companyId') as string | undefined;

        this.emitToolTriggered(companyId, 'sync_inventory');

        if (userRole !== 'ADMIN') {
          return {
            success: false,
            message: 'Esta acción requiere permisos de administrador.',
          };
        }

        const direction = args.direction || 'from_meta';
        this.logger.log(`Sincronizando inventario: ${direction}`);

        return {
          success: true,
          direction,
          synced: 25,
          errors: 0,
          message: `Inventario sincronizado: 25 productos actualizados (${direction}).`,
        };
      },
    });
  }

  get allTools(): FunctionTool[] {
    return [
      //this.searchProductsTool,
      //this.getProductInfoTool,
      this.createPaymentOrderTool,
      this.checkPaymentStatusTool,
      this.generatePaymentQrTool,
      this.syncInventoryTool,
    ];
  }

  private emitToolTriggered(
    companyId: string | undefined,
    toolName: string,
  ): void {
    if (!companyId) {
      return;
    }

    this.emitCompanyEvent(companyId, {
      type: SystemEventType.TOOL_ACTION_TRIGGERED,
      payload: { toolName },
    });
  }

  private emitCompanyEvent(
    companyId: string,
    params: {
      type: SystemEventType;
      payload: Record<string, unknown>;
    },
  ): void {
    const event: SystemNotificationEvent = {
      companyId,
      type: params.type,
      timestamp: new Date().toISOString(),
      payload: params.payload,
    };

    this.eventEmitter.emit(SYSTEM_EVENT_CHANNEL, event);
  }
}
