import { Injectable, Logger } from '@nestjs/common';
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
import { z } from 'zod';
import { SupabaseService } from '../../../../common/intraestructure/supabase/supabase.service';

interface SearchPublicKnowledgeRow {
  entity_name: string;
  data: Record<string, unknown>;
}

const searchCompanyInformationSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .describe('Consulta breve con palabras clave para buscar información pública de la empresa.'),
});

type SearchCompanyInformationArgs = z.infer<
  typeof searchCompanyInformationSchema
>;

@Injectable()
export class KnowledgeBaseToolsService {
  private readonly logger = new Logger(KnowledgeBaseToolsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  get(): FunctionTool {
    return new FunctionTool({
      name: 'search_company_information',
      description:
        'Busca información pública de la empresa (horarios, servicios y políticas) usando palabras clave concisas.',
      parameters: searchCompanyInformationSchema,
      execute: async (args, context?: ToolContext) => {
        const parsedArgs = searchCompanyInformationSchema.parse(
          args,
        ) as SearchCompanyInformationArgs;

        const companyId = context?.state?.get('app:companyId');

        if (!companyId || typeof companyId !== 'string') {
          this.logger.warn('No se encontró app:companyId en el estado de sesión');
          return {
            success: false,
            message:
              'No fue posible identificar la empresa para consultar la base de conocimiento.',
            results: [] as Array<{ entityName: string; data: Record<string, unknown> }>,
          };
        }

        if (!this.supabase.isEnabled()) {
          this.logger.error('Supabase no está configurado para buscar conocimiento');
          return {
            success: false,
            message:
              'La base de conocimiento no está disponible temporalmente. Intenta nuevamente más tarde.',
            results: [] as Array<{ entityName: string; data: Record<string, unknown> }>,
          };
        }

        try {
          const rows = await this.supabase.query<SearchPublicKnowledgeRow>(
            `select entity_name, data
             from public.search_public_knowledge($1::uuid, $2::text)`,
            [companyId, parsedArgs.query],
          );

          if (rows.length === 0) {
            return {
              success: true,
              message:
                'No se encontró información pública relacionada en la base de datos.',
              results: [] as Array<{ entityName: string; data: Record<string, unknown> }>,
            };
          }

          const results = rows.map((row) => ({
            entityName: row.entity_name,
            data: row.data,
          }));

          return {
            success: true,
            message: `Se encontraron ${results.length} resultado(s) relevantes.`,
            results,
          };
        } catch (error) {
          const safeError = error as Error;
          this.logger.error(
            `Error al ejecutar search_public_knowledge: ${safeError.message}`,
          );
          return {
            success: false,
            message:
              'Falló la búsqueda de información pública de la empresa. Intenta nuevamente en unos momentos.',
            results: [] as Array<{ entityName: string; data: Record<string, unknown> }>,
          };
        }
      },
    });
  }

  get tools(): FunctionTool[] {
    return [this.get()];
  }
}
