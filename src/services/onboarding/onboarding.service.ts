import { Injectable, Logger } from '@nestjs/common';
import { CompanyIntegrationsService } from '../integrations/company-integrations.service';
import { GoogleOauthService } from '../google/google-oauth.service';
import type {
  AgentResponse,
  RouterMessageContext,
} from '../../types/whatsapp.types';
import { UserRole } from '../../types/whatsapp.types';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly integrations: CompanyIntegrationsService,
    private readonly googleOauth: GoogleOauthService,
  ) {}

  async run(context: RouterMessageContext): Promise<AgentResponse | null> {
    if (context.role !== UserRole.ADMIN) {
      return null;
    }

    const hasCalendar = await this.integrations.hasGoogleCalendar(
      context.tenant.companyId,
    );

    if (hasCalendar) {
      return null;
    }

    const alreadyPrompted = Boolean(
      context.adkSession.context?.google_onboarding_prompted,
    );

    if (!alreadyPrompted) {
      context.adkSession.context.google_onboarding_prompted = true;
    }

    if (!this.googleOauth.isEnabled()) {
      this.logger.warn(
        'Google OAuth no configurado, no se puede completar onboarding.',
      );
      return {
        actions: [
          {
            type: 'text',
            text: 'Necesito que configures las credenciales de Google en el backend para vincular el calendario. Avísame cuando estén listas.',
          },
        ],
      };
    }

    const consentUrl = this.googleOauth.buildConsentUrl({
      company_id: context.tenant.companyId,
      admin_phone: context.senderId,
    });

    if (!consentUrl) {
      return {
        actions: [
          {
            type: 'text',
            text: 'No pude generar el enlace de Google OAuth. Revisa las credenciales configuradas.',
          },
        ],
      };
    }

    return {
      actions: [
        {
          type: 'text',
          text: 'Parece que no tienes una cuenta de Google asociada. Inicia sesión para habilitar las herramientas administrativas del bot.',
        },
        {
          type: 'text',
          text: consentUrl,
        },
        {
          type: 'text',
          text: 'Cuando termines el proceso en el navegador regresa a WhatsApp y repite tu solicitud de administración.',
        },
      ],
      metadata: {
        onboardingStep: 'GOOGLE_CALENDAR_AUTH',
      },
    };
  }
}
