/**
 * Herramientas (tools) para acceder a la Knowledge Base de la empresa.
 * Basado en el esquema flexible entity_definitions/dynamic_records del DBML.
 */
import { Injectable, Logger } from '@nestjs/common';
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
import { z } from 'zod';
import { SupabaseService } from '../../../../common/intraestructure/supabase/supabase.service';

interface KnowledgeBaseToolDependencies {
  queryPublicKnowledgeBase: (
    companyId: string,
    category: string,
    searchTerm?: string,
  ) => Promise<Record<string, unknown>[]>;
  listPublicEntities: (companyId: string) => Promise<string[]>;
}

let dependencies: KnowledgeBaseToolDependencies | null = null;
const logger = new Logger('KnowledgeBaseTools');

export function setKnowledgeBaseToolDependencies(
  deps: KnowledgeBaseToolDependencies,
): void {
  dependencies = deps;
  logger.log('Knowledge Base tools configuradas');
}

export const queryKnowledgeBaseTool = new FunctionTool({
  name: 'query_knowledge_base',
  description:
    'Busca información específica de la empresa en su base de conocimiento (Horarios, Precios, Inventarios, Materias, etc.). ' +
    'Usa esta herramienta cuando el usuario pregunte por información que no está en el catálogo de productos estándar. ' +
    'Solo devuelve datos públicos - los datos marcados como privados no son accesibles.',
  parameters: z.object({
    category: z
      .string()
      .describe(
        'Categoría o tipo de información a buscar (ej: "Horarios", "Materias", "Niveles", "Instituciones")',
      ),
    search_term: z
      .string()
      .optional()
      .describe(
        'Término de búsqueda para filtrar resultados (ej: "Lunes", "Matemáticas", "Mañana")',
      ),
  }),
  execute: async (args, context?: ToolContext) => {
    logger.debug(
      `Consultando knowledge base: ${args.category} (término: ${args.search_term || 'ninguno'})`,
    );

    if (!dependencies) {
      logger.error('Knowledge Base tools no configuradas');
      return {
        success: false,
        error: 'Sistema de conocimiento no disponible temporalmente',
        results: [],
      };
    }

    const state = context?.state;
    const companyId = state?.get('app:companyId');

    if (!companyId) {
      logger.warn('No se encontró companyId en el contexto');
      return {
        success: false,
        error: 'No se pudo identificar la empresa',
        results: [],
      };
    }

    try {
      const results = await dependencies.queryPublicKnowledgeBase(
        companyId as string,
        args.category,
        args.search_term,
      );

      if (results.length === 0) {
        return {
          success: true,
          message: `No encontré información sobre "${args.category}"${args.search_term ? ` con "${args.search_term}"` : ''}`,
          results: [],
          hint: 'Intenta con una categoría diferente o un término más general',
        };
      }

      return {
        success: true,
        message: `Encontré ${results.length} resultado(s) en "${args.category}"`,
        results,
        category: args.category,
        search_term: args.search_term,
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`Error consultando knowledge base: ${err.message}`);
      return {
        success: false,
        error: 'Error al buscar información',
        results: [],
      };
    }
  },
});

export const listKnowledgeCategoriesTool = new FunctionTool({
  name: 'list_knowledge_categories',
  description:
    'Lista las categorías de información disponibles para consultar (ej: Horarios, Materias, Niveles). ' +
    'Usa esta herramienta cuando necesites saber qué tipos de información tiene la empresa.',
  parameters: z.object({}),
  execute: async (_args, context?: ToolContext) => {
    logger.debug('Listando categorías de knowledge base');

    if (!dependencies) {
      logger.error('Knowledge Base tools no configuradas');
      return {
        success: false,
        error: 'Sistema de conocimiento no disponible temporalmente',
        categories: [],
      };
    }

    const state = context?.state;
    const companyId = state?.get('app:companyId');

    if (!companyId) {
      logger.warn('No se encontró companyId en el contexto');
      return {
        success: false,
        error: 'No se pudo identificar la empresa',
        categories: [],
      };
    }

    try {
      const categories = await dependencies.listPublicEntities(
        companyId as string,
      );

      if (categories.length === 0) {
        return {
          success: true,
          message: 'Esta empresa no tiene información adicional configurada',
          categories: [],
        };
      }

      return {
        success: true,
        message: `La empresa tiene ${categories.length} categoría(s) de información`,
        categories,
        hint: 'Usa query_knowledge_base con una de estas categorías para obtener detalles',
      };
    } catch (error) {
      const err = error as Error;
      logger.error(`Error listando categorías: ${err.message}`);
      return {
        success: false,
        error: 'Error al listar categorías',
        categories: [],
      };
    }
  },
});

export const knowledgeBaseTools = [
  queryKnowledgeBaseTool,
  listKnowledgeCategoriesTool,
];

@Injectable()
export class KnowledgeBaseToolsService {
  private readonly logger = new Logger(KnowledgeBaseToolsService.name);

  constructor(private readonly supabase: SupabaseService) {
    if (this.supabase.isEnabled()) {
      setKnowledgeBaseToolDependencies({
        queryPublicKnowledgeBase: this.queryPublicKnowledgeBase.bind(this),
        listPublicEntities: this.listPublicEntities.bind(this),
      });
    } else {
      this.logger.warn(
        'Supabase no configurado; Knowledge Base tools en fallback.',
      );
    }
  }

  readonly tools = knowledgeBaseTools;

  private async queryPublicKnowledgeBase(
    companyId: string,
    category: string,
    searchTerm?: string,
  ): Promise<Record<string, unknown>[]> {
    if (!this.supabase.isEnabled()) return [];

    const rows = await this.supabase.query<{ data: Record<string, unknown> }>(
      `select dr.data as data
       from dynamic_records dr
       inner join entity_definitions ed on ed.id = dr.entity_definition_id
       where dr.company_id = $1
         and ed.entity_name = $2
         and coalesce(ed.is_public_default, true) = true
         and ($3::text is null or dr.data::text ilike '%' || $3 || '%')
       order by dr.updated_at desc
       limit 20`,
      [companyId, category, searchTerm ?? null],
    );

    return rows.map((row) => row.data || {});
  }

  private async listPublicEntities(companyId: string): Promise<string[]> {
    if (!this.supabase.isEnabled()) return [];

    const rows = await this.supabase.query<{ entity_name: string }>(
      `select entity_name
       from entity_definitions
       where company_id = $1 and coalesce(is_public_default, true) = true
       order by entity_name asc`,
      [companyId],
    );

    return rows.map((row) => row.entity_name);
  }
}
