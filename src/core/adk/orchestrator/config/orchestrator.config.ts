import type { FunctionTool, LlmAgent } from '@google/adk';
import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { OrchestratorInput } from '../types/orchestrator-io.types';
import type { OrchestrationResult } from '../orchestrator.types';

export interface OrchestratorConfig {
  getName(): string;
  getDescription(): string;
  buildInstruction(): string;
  buildInput(context: RouterMessageContext): OrchestratorInput;
  buildInitialState(context: RouterMessageContext): Record<string, unknown>;
  detectIntent(message: string): OrchestrationResult['intent'];
  getSubAgents(): LlmAgent[];
  getTools(): FunctionTool[];
  preRoute?(context: RouterMessageContext): Promise<OrchestrationResult | null>;
  getErrorLogPrefix(): string;
  getErrorResponseText(): string;
}
