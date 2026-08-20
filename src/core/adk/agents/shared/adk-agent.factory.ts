import { ConfigService } from '@nestjs/config';
import { Gemini, LlmAgent } from '@google/adk';
import type { SubAgentDefinition } from './subagent-definition';
import { resolveGeminiModelName } from '../../config/gemini-model.config';

export function createGeminiAgent(
  config: ConfigService,
  definition: SubAgentDefinition,
): LlmAgent {
  const apiKey = config.get<string>('GOOGLE_GENAI_API_KEY', '');
  const modelName = definition.modelName ?? resolveGeminiModelName(config);

  if (!apiKey) {
    throw new Error(
      `Google AI no configurado para ${definition.errorLabel}`,
    );
  }

  const model = new Gemini({ apiKey, model: modelName });

  return new LlmAgent({
    name: definition.name,
    model,
    instruction: definition.instruction,
    description: definition.description,
    tools: definition.tools,
  });
}
