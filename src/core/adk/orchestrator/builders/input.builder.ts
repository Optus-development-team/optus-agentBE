import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { OrchestratorInput } from '../types/orchestrator-io.types';

export function buildInput(context: RouterMessageContext): OrchestratorInput {
  return {
    message: {
      text: context.originalText,
      ...(context.referredProduct
        ? {
            referredProduct: {
              catalogId: context.referredProduct.catalogId,
              productRetailerId: context.referredProduct.productRetailerId,
            },
          }
        : {}),
    },
    sender: {
      id: context.senderId,
      name: context.senderName,
      role: context.role,
    },
    tenant: {
      id: context.tenant.companyId,
      name: context.tenant.companyName,
      vertical: context.tenant.vertical,
    },
  };
}
