import { z } from 'zod';
import { zodObjectToSchema } from '@google/adk';
export type FormattedResponseType =
  | 'binary_question'
  | 'list'
  | 'buttons'
  | 'cta_url';

export interface FormattedResponseOption {
  id: string;
  title: string;
}

export interface FormattedResponseBase {
  stickerEventType?: string;
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

export interface BinaryQuestionFormattedResponse extends FormattedResponseBase {
  type: 'binary_question';
  question: string;
  options: [FormattedResponseOption, FormattedResponseOption];
}

export interface ButtonsFormattedResponse extends FormattedResponseBase {
  type: 'buttons';
  body: string;
  options: FormattedResponseOption[];
}

export interface ListFormattedResponse extends FormattedResponseBase {
  type: 'list';
  body: string;
  buttonText: string;
  sections: FormattedResponseListSection[];
}

export interface CtaUrlFormattedResponse extends FormattedResponseBase {
  type: 'cta_url';
  body: string;
  buttonDisplayText: string;
  buttonUrl: string;
  headerImageUrl?: string;
  headerImageId?: string;
  footerText?: string;
}

export type FormattedResponse =
  | BinaryQuestionFormattedResponse
  | ButtonsFormattedResponse
  | ListFormattedResponse
  | CtaUrlFormattedResponse;

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
  type: z.enum(['binary_question', 'list', 'buttons', 'cta_url']),
  question: z.string().optional(),
  options: z.array(ResponseOptionSchema).optional(),
  body: z.string().optional(),
  buttonText: z.string().optional(),
  buttonDisplayText: z.string().optional(),
  buttonUrl: z.string().optional(),
  headerImageUrl: z.string().optional(),
  headerImageId: z.string().optional(),
  footerText: z.string().optional(),
  sections: z.array(ResponseListSectionSchema).optional(),
  stickerEventType: z.string().optional(),
});

export const LLM_FORMATTED_RESPONSE_SCHEMA = zodObjectToSchema(
  FormattedResponseSchema,
);

export const LLM_FORMATTER_OUTPUT_KEY = 'formatted_response';
