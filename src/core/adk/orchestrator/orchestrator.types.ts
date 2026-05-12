import type { FormattedResponse } from '../formatters/types/llm-response.types';

export type OptusIntent = 'VERIFY_PHONE' | 'UNKNOWN';

export interface OrchestrationResult {
  intent: OptusIntent;
  agentUsed: string;
  responseText?: string;
  formattedResponse: FormattedResponse;
  sessionState?: Record<string, unknown>;
}
