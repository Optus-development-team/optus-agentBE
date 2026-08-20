import type { FunctionTool } from '@google/adk';

export interface SubAgentDefinition {
  name: string;
  description: string;
  instruction: string;
  tools: FunctionTool[];
  errorLabel: string;
  modelName?: string;
}
