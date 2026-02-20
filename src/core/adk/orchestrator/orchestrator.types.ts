export type OptusIntent = 'VERIFY_PHONE' | 'UNKNOWN';

export interface OrchestrationResult {
  intent: OptusIntent;
  agentUsed: string;
  responseText?: string;
  sessionState?: Record<string, unknown>;
}
