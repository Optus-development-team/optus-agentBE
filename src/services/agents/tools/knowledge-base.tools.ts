/**
 * Herramientas (tools) para acceder a la Knowledge Base de la empresa.
 * Permite al agente consultar datos dinámicos almacenados en el Universal Schema.
 *
 * IMPORTANTE: Todas las consultas filtran datos privados automáticamente.
 * El agente NUNCA puede acceder a entidades marcadas con is_public_default = false.
 *
 * @see https://google.github.io/adk-docs/tools-custom/function-tools/
 */
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
import { z } from 'zod';
import { Logger } from '@nestjs/common';

const logger = new Logger('KnowledgeBaseTools');

/**
 * Interfaz para inyectar el servicio de sincronización.
 * Se configura en el AdkOrchestratorService.
 */
export interface KnowledgeBaseToolDependencies {
  queryPublicKnowledgeBase: (
    companyId: string,
    category: string,
    searchTerm?: string,
  ) => Promise<Record<string, unknown>[]>;
  listPublicEntities: (companyId: string) => Promise<string[]>;
}

let dependencies: KnowledgeBaseToolDependencies | null = null;

/**
 * Configura las dependencias para las tools de knowledge base.
 * Debe llamarse durante la inicialización del AdkOrchestratorService.
 */
export function setKnowledgeBaseToolDependencies(
  deps: KnowledgeBaseToolDependencies,
): void {
  dependencies = deps;
  logger.log('Knowledge Base tools configuradas');
}

/**
 * Tool: Consultar la base de conocimiento de la empresa.
 *
 * Busca información específica en los datos dinámicos de la empresa.
 * FILTRO DE SEGURIDAD: Solo retorna datos de entidades públicas.
 *
 * @example
 * // Buscar horarios que contengan "Lunes"
 * query_knowledge_base({ category: "Horarios", search_term: "Lunes" })
 *
 * // Listar todas las materias
 * query_knowledge_base({ category: "Materias" })
 */
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

/**
 * Tool: Listar categorías de información disponibles.
 *
 * Muestra las entidades públicas que la empresa ha configurado.
 * Útil para que el agente sepa qué información puede consultar.
 */
export const listKnowledgeCategoriesTools = new FunctionTool({
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

/**
 * Exporta todas las tools de knowledge base.
 */
export const knowledgeBaseTools = [
  queryKnowledgeBaseTool,
  listKnowledgeCategoriesTools,
];
