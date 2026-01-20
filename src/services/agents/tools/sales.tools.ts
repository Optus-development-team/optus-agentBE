/**
 * Herramientas (tools) para el agente de ventas.
 * Estas tools permiten al agente interactuar con el catálogo de productos,
 * gestionar órdenes y procesar pagos.
 *
 * @see https://google.github.io/adk-docs/tools-custom/function-tools/
 */
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
import { z } from 'zod';
import { Logger } from '@nestjs/common';

const logger = new Logger('SalesTools');

/**
 * Tool: Buscar productos en el catálogo
 */
export const searchProductsTool = new FunctionTool({
  name: 'search_products',
  description:
    'Busca productos en el catálogo de la empresa por nombre, categoría o descripción. ' +
    'Usa esta herramienta cuando el usuario pregunte por productos específicos.',
  parameters: z.object({
    query: z
      .string()
      .describe('Término de búsqueda (nombre del producto, categoría, etc.)'),
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
    logger.debug(`Buscando productos: ${args.query}`);

    const state = context?.state;
    const companyId = state?.get('app:companyId') as string | undefined;

    // TODO: Implementar búsqueda real usando MetaCatalogService
    return {
      success: true,
      products: [
        {
          id: 'PROD-001',
          name: `Producto relacionado a "${args.query}"`,
          price: 100.0,
          currency: 'MXN',
          available: true,
          stock: 10,
        },
      ],
      message: `Encontré productos relacionados con "${args.query}" para la empresa ${companyId || 'desconocida'}`,
    };
  },
});

/**
 * Tool: Obtener información de producto específico
 */
export const getProductInfoTool = new FunctionTool({
  name: 'get_product_info',
  description:
    'Obtiene información detallada de un producto específico por su ID o SKU. ' +
    'Incluye precio, stock disponible, descripción y más.',
  parameters: z.object({
    productId: z.string().describe('ID único o SKU del producto'),
  }),
  execute: async (args, _context?: ToolContext) => {
    logger.debug(`Obteniendo info del producto: ${args.productId}`);

    // TODO: Implementar con MetaCatalogService
    return {
      success: true,
      product: {
        id: args.productId,
        name: 'Producto de ejemplo',
        description: 'Descripción detallada del producto',
        price: 250.0,
        currency: 'MXN',
        stock: 15,
        available: true,
        category: 'General',
      },
    };
  },
});

/**
 * Tool: Crear orden de pago
 */
export const createPaymentOrderTool = new FunctionTool({
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
    logger.debug(`Creando orden de pago: $${args.amount}`);

    const state = context?.state;
    const companyId = state?.get('app:companyId') as string | undefined;

    // Generar ID de orden único
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // TODO: Implementar con PaymentClientService/X402PaymentClientService
    return {
      success: true,
      orderId,
      amount: args.amount,
      currency: state?.get('app:currency') || 'MXN',
      status: 'pending',
      companyId,
      paymentUrl: `https://pay.example.com/${orderId}`,
      message: `Orden de pago ${orderId} creada por $${args.amount}. Escanea el QR o usa el link para pagar.`,
    };
  },
});

/**
 * Tool: Verificar estado de pago
 */
export const checkPaymentStatusTool = new FunctionTool({
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
    const orderId = args.orderId || (state?.get('temp:lastOrderId') as string);

    if (!orderId) {
      return {
        success: false,
        message:
          'No se especificó ID de orden y no hay orden reciente en la sesión.',
      };
    }

    logger.debug(`Verificando pago de orden: ${orderId}`);

    // TODO: Implementar con PaymentClientService
    return {
      success: true,
      orderId,
      status: 'pending', // pending, completed, failed, refunded
      amount: 100.0,
      currency: 'MXN',
      paidAt: null,
      message: `La orden ${orderId} está pendiente de pago.`,
    };
  },
});

/**
 * Tool: Generar QR de pago
 */
export const generatePaymentQrTool = new FunctionTool({
  name: 'generate_payment_qr',
  description:
    'Genera o regenera el código QR de pago para una orden específica. ' +
    'El QR puede ser escaneado con aplicaciones bancarias.',
  parameters: z.object({
    orderId: z.string().describe('ID de la orden para generar QR'),
    regenerate: z.boolean().optional().describe('Forzar regeneración del QR'),
  }),
  execute: async (args, _context?: ToolContext) => {
    logger.debug(`Generando QR para orden: ${args.orderId}`);

    // TODO: Implementar con PinataService y PaymentClientService
    return {
      success: true,
      orderId: args.orderId,
      qrUrl: `https://ipfs.example.com/qr/${args.orderId}.png`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      message: `QR generado para la orden ${args.orderId}. Válido por 30 minutos.`,
    };
  },
});

/**
 * Tool: Sincronizar inventario
 */
export const syncInventoryTool = new FunctionTool({
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

    if (userRole !== 'ADMIN') {
      return {
        success: false,
        message: 'Esta acción requiere permisos de administrador.',
      };
    }

    const direction = args.direction || 'from_meta';
    logger.log(`Sincronizando inventario: ${direction}`);

    // TODO: Implementar con MetaCatalogService
    return {
      success: true,
      direction,
      synced: 25,
      errors: 0,
      message: `Inventario sincronizado: 25 productos actualizados (${direction}).`,
    };
  },
});

/**
 * Array de todas las tools de ventas para el agente
 */
export const salesTools = [
  searchProductsTool,
  getProductInfoTool,
  createPaymentOrderTool,
  checkPaymentStatusTool,
  generatePaymentQrTool,
  syncInventoryTool,
];
