import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Gemini,
  LlmAgent,
  Runner,
  isFinalResponse,
  stringifyContent,
} from '@google/adk';
import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { OrchestrationResult } from '../orchestrator.types';
import { SupabaseSessionService } from '../session/supabase-session.service';
import type { OrchestratorConfig } from '../config/orchestrator.config';

export abstract class BaseOrchestratorService implements OnModuleInit {
  protected readonly logger: Logger;
  protected readonly appName = 'optus';
  protected runner?: Runner;
  protected orchestratorAgent?: LlmAgent;

  protected constructor(
    loggerName: string,
    private readonly configService: ConfigService,
    private readonly sessionService: SupabaseSessionService,
    private readonly orchestratorConfig: OrchestratorConfig,
  ) {
    this.logger = new Logger(loggerName);
  }

  onModuleInit(): void {
    this.initialize();
  }

  async route(context: RouterMessageContext): Promise<OrchestrationResult> {
    this.ensureInitialized();

    const userId = this.normalizePhone(context.senderId);
    const tenantAppName = context.tenant.companyName.trim().toLowerCase();
    const sessionId = `${tenantAppName}:${userId}`;

    await this.ensureSession(context, tenantAppName, userId, sessionId);

    try {
      const userMessage = {
        role: 'user' as const,
        parts: [{ text: this.orchestratorConfig.buildPrompt(context) }],
      };

      let responseText = '';
      let agentUsed = this.orchestratorConfig.getName();

      for await (const event of this.runner!.runAsync({
        userId,
        sessionId,
        newMessage: userMessage,
      })) {
        if (event.author && event.author !== 'user') {
          agentUsed = event.author;
        }

        if (isFinalResponse(event)) {
          responseText = stringifyContent(event);
        }
      }

      return {
        intent: this.orchestratorConfig.detectIntent(context.originalText),
        responseText,
        agentUsed,
        sessionState: (
          await this.sessionService.getSession({
            appName: tenantAppName,
            userId,
            sessionId,
          })
        )?.state as Record<string, unknown>,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `${this.orchestratorConfig.getErrorLogPrefix()}: ${err.message}`,
      );
      return {
        intent: 'UNKNOWN',
        responseText: this.orchestratorConfig.getErrorResponseText(),
        agentUsed: this.orchestratorConfig.getName(),
      };
    }
  }

  protected initialize(): void {
    const apiKey = this.configService.get<string>('GOOGLE_GENAI_API_KEY', '');
    const modelName = this.configService.get<string>(
      'GOOGLE_GENAI_MODEL',
      'gemini-2.0-flash',
    );

    if (!apiKey) {
      throw new Error(
        `Google AI no configurado para ${this.orchestratorConfig.getName()}`,
      );
    }

    const model = new Gemini({ apiKey, model: modelName });

    this.orchestratorAgent = new LlmAgent({
      name: this.orchestratorConfig.getName(),
      model,
      instruction: this.orchestratorConfig.buildInstruction(),
      description: this.orchestratorConfig.getDescription(),
      subAgents: this.orchestratorConfig.getSubAgents(),
      tools: this.orchestratorConfig.getTools(),
    });

    this.runner = new Runner({
      agent: this.orchestratorAgent,
      appName: this.appName,
      sessionService: this.sessionService,
    });
  }

  private ensureInitialized(): void {
    if (!this.runner || !this.orchestratorAgent) {
      this.initialize();
    }
  }

  private async ensureSession(
    context: RouterMessageContext,
    tenantAppName: string,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    const session = await this.sessionService.getSession({
      appName: tenantAppName,
      userId,
      sessionId,
    });

    if (!session) {
      await this.sessionService.createSession({
        appName: tenantAppName,
        userId,
        sessionId,
        state: this.orchestratorConfig.buildInitialState(context),
      });
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
