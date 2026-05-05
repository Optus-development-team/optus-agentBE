import type { Logger } from '@nestjs/common';
import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { OrchestrationResult } from '../orchestrator.types';
import type { OAuthService } from '../../../../features/auth/oauth.service';
import type { WhatsAppMessagingService } from '../../../../features/messaging/features/whatsapp/services/whatsapp.messaging.service';

export interface GoogleAccountConnectionCtaParams {
  logger: Logger;
  oauthService: OAuthService;
  whatsappMessaging: WhatsAppMessagingService;
  context: RouterMessageContext;
  userId: string;
  companyId: string;
  responseText?: string;
  agentUsed?: string;
}

export async function handleGoogleAccountConnectionRequirement(
  params: GoogleAccountConnectionCtaParams,
): Promise<OrchestrationResult> {
  const responseText =
    params.responseText ??
    'Necesitas completar la conexión con tu cuenta de Google para continuar.';

  params.logger.log(
    `Admin ${params.userId} needs to connect Google account for company ${params.companyId}`,
  );

  try {
    const authUrl = params.oauthService.getAuthUrl(params.companyId);

    await params.whatsappMessaging.sendInteractiveCtaUrl(
      params.userId,
      {
        bodyText:
          '⚠️ *Configuración necesaria*\n\nPara gestionar tu empresa, es necesario conectar tu cuenta de Google.',
        buttonDisplayText: 'Conectar cuenta de Google',
        buttonUrl: authUrl,
        footerText: 'Cuando termines, vuelve al chat y continúa.',
      },
      {
        phoneNumberId:
          params.context.phoneNumberId ?? params.context.tenant?.phoneNumberId,
        companyId: params.companyId,
      },
    );

    await params.whatsappMessaging.sendStickerForEvent(
      params.userId,
      'error_or_unauthorized_action',
      {
        phoneNumberId:
          params.context.phoneNumberId ?? params.context.tenant?.phoneNumberId,
        companyId: params.companyId,
      },
    );
  } catch (error) {
    params.logger.error(
      `Error sending Google account CTA: ${(error as Error).message}`,
    );

    try {
      await params.whatsappMessaging.sendStickerForEvent(
        params.userId,
        'error_or_unauthorized_action',
        {
          phoneNumberId:
            params.context.phoneNumberId ?? params.context.tenant?.phoneNumberId,
          companyId: params.companyId,
        },
      );
    } catch (stickerError) {
      params.logger.error(
        `Error sending error sticker: ${(stickerError as Error).message}`,
      );
    }
  }

  return {
    intent: 'UNKNOWN',
    responseText,
    agentUsed: params.agentUsed ?? 'admin_orchestrator',
  };
}