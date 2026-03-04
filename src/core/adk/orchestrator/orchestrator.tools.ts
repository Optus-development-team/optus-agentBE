import { Injectable } from '@nestjs/common';
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
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
  constructor(
    private readonly verification: VerificationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  get verifyPhoneCodeTool(): FunctionTool {
    return new FunctionTool({
      name: 'verify_phone_code',
      description:
        'Verifica un código OTP de teléfono de 6 caracteres y marca el número como verificado.',
      parameters: z.object({
        senderPhone: z.string().describe('Número de teléfono del usuario'),
        code: z.string().describe('Código OTP extraído del mensaje'),
        whatsappUsername: z
          .string()
          .optional()
          .describe('Nombre de WhatsApp si está disponible'),
      }),
      execute: async (args, context?: ToolContext) => {
        const companyId = context?.state?.get('app:companyId') as
          | string
          | undefined;

        if (companyId) {
          const event: SystemNotificationEvent = {
            companyId,
            type: SystemEventType.TOOL_ACTION_TRIGGERED,
            timestamp: new Date().toISOString(),
            payload: {
              toolName: 'verify_phone_code',
            },
          };

          this.eventEmitter.emit(SYSTEM_EVENT_CHANNEL, event);
        }

        const verified = await this.verification.verifyCode(
          args.senderPhone,
          args.code,
        );
        return { verified };
      },
    });
  }
}
