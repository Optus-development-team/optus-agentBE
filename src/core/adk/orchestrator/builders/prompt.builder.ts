import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';

export interface PromptBuilderOptions {
  includeVertical?: boolean;
}

export function buildPrompt(
  context: RouterMessageContext,
  options: PromptBuilderOptions = {},
): string {
  const parts: string[] = [];
  parts.push(context.originalText);

  const contextParts: string[] = [];
  contextParts.push(`[Teléfono del usuario: ${context.senderId}]`);

  if (options.includeVertical) {
    contextParts.push(`[Vertical: ${context.tenant.vertical}]`);
  }

  if (context.role) {
    contextParts.push(`[Rol detectado: ${context.role}]`);
  }

  if (context.tenant?.companyName) {
    contextParts.push(`[Empresa: ${context.tenant.companyName}]`);
  }

  if (context.senderName) {
    contextParts.push(`[Nombre WhatsApp: ${context.senderName}]`);
  }

  if (context.referredProduct) {
    contextParts.push(
      `[Producto referenciado: ${context.referredProduct.productRetailerId}]`,
    );
  }

  if (contextParts.length > 0) {
    parts.push(`\n---\nContexto:\n${contextParts.join('\n')}`);
  }

  return parts.join('\n');
}
