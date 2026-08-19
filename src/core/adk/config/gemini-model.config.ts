import type { ConfigService } from '@nestjs/config';

const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash';
const SHUT_DOWN_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-exp',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
]);

export function resolveGeminiModelName(
  config: ConfigService,
  fallback = FALLBACK_GEMINI_MODEL,
): string {
  const configuredModel =
    config.get<string>('GOOGLE_GENAI_MODEL', fallback)?.trim() || fallback;

  return SHUT_DOWN_GEMINI_MODELS.has(configuredModel)
    ? fallback
    : configuredModel;
}
