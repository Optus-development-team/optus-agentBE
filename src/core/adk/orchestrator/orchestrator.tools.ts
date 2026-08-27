import { Injectable, Logger } from '@nestjs/common';
import { FunctionTool } from '@google/adk';
import type { Context } from '@google/adk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { z } from 'zod';
import { VerificationService } from '../../../features/login/verification.service';
import {
  SYSTEM_EVENT_CHANNEL,
  SystemEventType,
  type SystemNotificationEvent,
} from '../../../common/events/system-events.types';

@Injectable()
export class OrchestratorToolsService {
  private readonly logger = new Logger(OrchestratorToolsService.name);

  constructor(
    private readonly verification: VerificationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  get verifyPhoneCodeTool(): FunctionTool {
    return new FunctionTool({
      name: 'verify_phone_code',
      description:
        'Verifica un código OTP de teléfono de 4 caracteres y marca el número como verificado.',
      parameters: z.object({
        senderPhone: z.string().describe('Número de teléfono del usuario'),
        code: z.string().describe('Código OTP extraído del mensaje'),
        whatsappUsername: z
          .string()
          .optional()
          .describe('Nombre de WhatsApp si está disponible'),
      }),
      execute: async (args, context?: Context) => {
        const rawCompanyId = context?.state?.get('app:companyId');
        const companyId =
          typeof rawCompanyId === 'string' ? rawCompanyId : undefined;

        if (companyId) {
          const event: SystemNotificationEvent = {
            companyId,
            type: SystemEventType.TOOL_ACTION_TRIGGERED,
            timestamp: new Date().toISOString(),
            payload: { toolName: 'verify_phone_code' },
          };

          this.eventEmitter.emit(SYSTEM_EVENT_CHANNEL, event);
        }

        const verified = await this.verification.verifyCode(
          args.senderPhone,
          args.code,
        );

        if (!verified) {
          return { verified: false, persisted: false };
        }

        if (!companyId) {
          this.logger.warn(
            '[verify_phone_code] Código válido pero sin companyId en contexto; no se persistió company_users.',
          );
          return {
            verified: false,
            persisted: false,
            reason: 'missing_company_context',
          };
        }

        const persisted = await this.verification.markPhoneVerifiedByCompany(
          companyId,
          args.senderPhone,
        );
        this.logger.log(
          `[verify_phone_code] Código válido. phone=${args.senderPhone} company=${companyId} persisted=${persisted}`,
        );

        return {
          verified: persisted,
          persisted,
          reason: persisted ? undefined : 'company_user_not_found',
        };
      },
    });
  }
}
