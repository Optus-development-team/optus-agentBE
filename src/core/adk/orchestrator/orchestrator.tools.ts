import { Injectable } from '@nestjs/common';
import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { VerificationService } from '../../../features/login/verification.service';

@Injectable()
export class OrchestratorToolsService {
  constructor(private readonly verification: VerificationService) {}

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
      execute: async (args) => {
        const verified = await this.verification.verifyCode(
          args.senderPhone,
          args.code,
        );
        return { verified };
      },
    });
  }
}
