import { z } from 'zod';
import { zodObjectToSchema } from '@google/adk';
export type FormattedResponseType =
  | 'plain_text'
  | 'binary_question'
  | 'list'
  | 'buttons';

export interface FormattedResponseOption {
  id: string;
  title: string;
}

export interface FormattedResponseListItem {
  id: string;
  title: string;
  description?: string;
}

export interface FormattedResponseListSection {
  title: string;
  items: FormattedResponseListItem[];
}

export interface PlainTextFormattedResponse {
  type: 'plain_text';
  text: string;
}

export interface BinaryQuestionFormattedResponse {
  type: 'binary_question';
  question: string;
  options: [FormattedResponseOption, FormattedResponseOption];
}

export interface ButtonsFormattedResponse {
  type: 'buttons';
  body: string;
  options: FormattedResponseOption[];
}

export interface ListFormattedResponse {
  type: 'list';
  body: string;
  buttonText: string;
  sections: FormattedResponseListSection[];
}

export type FormattedResponse =
  | PlainTextFormattedResponse
  | BinaryQuestionFormattedResponse
  | ButtonsFormattedResponse
  | ListFormattedResponse;

export interface LlmResponseFormatInput {
  responseText: string;
  intent?: string;
  agentUsed?: string;
}

const ResponseFormatInputSchema = z.object({
  responseText: z.string(),
  intent: z.string().optional(),
  agentUsed: z.string().optional(),
});

export const LLM_RESPONSE_FORMAT_INPUT_SCHEMA = zodObjectToSchema(
  ResponseFormatInputSchema,
);

const ResponseOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
});

const ResponseListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
});

const ResponseListSectionSchema = z.object({
  title: z.string(),
  items: z.array(ResponseListItemSchema).min(1),
});

const FormattedResponseSchema = z.object({
  type: z.enum(['plain_text', 'binary_question', 'list', 'buttons']),
  text: z.string().optional(),
  question: z.string().optional(),
  options: z.array(ResponseOptionSchema).optional(),
  body: z.string().optional(),
  buttonText: z.string().optional(),
  sections: z.array(ResponseListSectionSchema).optional(),
});

export const LLM_FORMATTED_RESPONSE_SCHEMA = zodObjectToSchema(
  FormattedResponseSchema,
);

export const LLM_FORMATTER_OUTPUT_KEY = 'formatted_response';
