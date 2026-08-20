import type { FunctionTool } from '@google/adk';
import type { SubAgentDefinition } from './subagent-definition';

export abstract class BaseSubAgentConfig {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly errorLabel: string;

  abstract buildInstruction(): string;

  buildDefinition(tools: FunctionTool[]): SubAgentDefinition {
    return {
      name: this.name,
      description: this.description,
      instruction: this.buildInstruction(),
      tools,
      errorLabel: this.errorLabel,
    };
  }
}
