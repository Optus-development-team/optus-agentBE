/**
 * Servicio para sincronización de datos desde Google Sheets.
 * Implementa la lógica de Upsert con manejo de privacidad.
 *
 * Flujo:
 * 1. Buscar/Crear entity_definition basada en sheet_name
 * 2. Actualizar flag is_public_default según payload
 * 3. Wipe & Replace: Eliminar registros antiguos e insertar nuevos
 *
 * @see https://google.github.io/adk-docs/tools-custom/function-tools/
 */
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../database/supabase.service';
import {
  SheetsSyncPayloadDto,
  SheetsSyncResponseDto,
  SheetRowDto,
} from '../../dto/sheets-sync.dto';

/**
 * Interfaz para entity_definition en la BD.
 */
interface EntityDefinition {
  id: string;
  company_id: string;
  entity_name: string;
  schema_sample: Record<string, unknown>;
  is_public_default: boolean;
}

@Injectable()
export class SheetsSyncService {
  private readonly logger = new Logger(SheetsSyncService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Sincroniza datos desde Google Sheets a la base de datos.
   *
   * @param payload - Datos enviados por el Google Workspace Add-on
   * @returns Resultado de la sincronización
   */
  async syncSheetData(
    payload: SheetsSyncPayloadDto,
  ): Promise<SheetsSyncResponseDto> {
    const { company_id, sheet_name, is_public, data } = payload;

    this.logger.log(
      `Iniciando sincronización: ${sheet_name} (${data.length} registros, público: ${is_public})`,
    );

    try {
      // 1. Verificar que la empresa existe
      const companyExists = await this.verifyCompanyExists(company_id);
      if (!companyExists) {
        return {
          success: false,
          message: `Empresa no encontrada: ${company_id}`,
          errors: ['COMPANY_NOT_FOUND'],
        };
      }

      // 2. Buscar o crear entity_definition
      const entityDef = await this.upsertEntityDefinition(
        company_id,
        sheet_name,
        is_public,
        data[0] || {},
      );

      if (!entityDef) {
        return {
          success: false,
          message: 'Error al crear/actualizar la definición de entidad',
          errors: ['ENTITY_DEFINITION_ERROR'],
        };
      }

      // 3. Wipe & Replace: Eliminar registros antiguos
      const deletedCount = await this.deleteOldRecords(
        company_id,
        entityDef.id,
      );
      this.logger.debug(`Eliminados ${deletedCount} registros anteriores`);

      // 4. Insertar nuevos registros
      const insertedCount = await this.insertNewRecords(
        company_id,
        entityDef.id,
        data,
      );

      this.logger.log(
        `Sincronización completada: ${insertedCount} registros insertados para ${sheet_name}`,
      );

      return {
        success: true,
        message: `Sincronización exitosa: ${insertedCount} registros`,
        entity_definition_id: entityDef.id,
        records_synced: insertedCount,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error en sincronización: ${err.message}`, err.stack);
      return {
        success: false,
        message: 'Error interno durante la sincronización',
        errors: [err.message],
      };
    }
  }

  /**
   * Verifica que la empresa existe en la base de datos.
   */
  private async verifyCompanyExists(companyId: string): Promise<boolean> {
    const result = await this.supabaseService.query<{ id: string }>(
      'SELECT id FROM public.companies WHERE id = $1 LIMIT 1',
      [companyId],
    );
    return result.length > 0;
  }

  /**
   * Busca o crea una entity_definition para la hoja de cálculo.
   * Actualiza el flag is_public_default según el payload.
   */
  private async upsertEntityDefinition(
    companyId: string,
    entityName: string,
    isPublic: boolean,
    sampleData: SheetRowDto,
  ): Promise<EntityDefinition | null> {
    // Crear schema_sample a partir de los datos de ejemplo
    const schemaSample = this.createSchemaSample(sampleData);

    const result = await this.supabaseService.query<EntityDefinition>(
      `
      INSERT INTO public.entity_definitions (company_id, entity_name, schema_sample, is_public_default, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (company_id, entity_name) 
      DO UPDATE SET 
        schema_sample = COALESCE(EXCLUDED.schema_sample, entity_definitions.schema_sample),
        is_public_default = EXCLUDED.is_public_default,
        updated_at = now()
      RETURNING id, company_id, entity_name, schema_sample, is_public_default
      `,
      [companyId, entityName, JSON.stringify(schemaSample), isPublic],
    );

    return result[0] || null;
  }

  /**
   * Elimina todos los registros anteriores de una entidad.
   */
  private async deleteOldRecords(
    companyId: string,
    entityDefinitionId: string,
  ): Promise<number> {
    const result = await this.supabaseService.query<{ count: number }>(
      `
      WITH deleted AS (
        DELETE FROM public.dynamic_records
        WHERE company_id = $1 AND entity_definition_id = $2
        RETURNING 1
      )
      SELECT COUNT(*)::int as count FROM deleted
      `,
      [companyId, entityDefinitionId],
    );

    return result[0]?.count || 0;
  }

  /**
   * Inserta los nuevos registros en dynamic_records.
   */
  private async insertNewRecords(
    companyId: string,
    entityDefinitionId: string,
    data: SheetRowDto[],
  ): Promise<number> {
    if (data.length === 0) return 0;

    // Preparar los valores para inserción masiva
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const row of data) {
      const externalRowId = row._rowId || null;
      // Excluir _rowId del objeto data - eslint-disable-next-line
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _rowId, ...cleanData } = row;

      // Generar search_text combinando todos los valores string
      const searchText = this.generateSearchText(cleanData);

      placeholders.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, to_tsvector('spanish', $${paramIndex++}))`,
      );
      values.push(
        companyId,
        entityDefinitionId,
        externalRowId,
        JSON.stringify(cleanData),
        searchText,
      );
    }

    const result = await this.supabaseService.query<{ count: number }>(
      `
      WITH inserted AS (
        INSERT INTO public.dynamic_records (company_id, entity_definition_id, external_row_id, data, search_text)
        VALUES ${placeholders.join(', ')}
        RETURNING 1
      )
      SELECT COUNT(*)::int as count FROM inserted
      `,
      values,
    );

    return result[0]?.count || 0;
  }

  /**
   * Crea un schema_sample a partir de los datos de ejemplo.
   */
  private createSchemaSample(data: SheetRowDto): Record<string, string> {
    const schema: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key !== '_rowId') {
        schema[key] = typeof value === 'string' ? value : String(value);
      }
    }
    return schema;
  }

  /**
   * Genera texto de búsqueda concatenando todos los valores string.
   */
  private generateSearchText(data: Record<string, unknown>): string {
    return Object.values(data)
      .filter((v) => typeof v === 'string')
      .join(' ');
  }

  /**
   * Consulta datos públicos de una entidad (para uso del Agente IA).
   * IMPORTANTE: Siempre filtra por is_public_default = true.
   *
   * @param companyId - ID de la empresa
   * @param category - Nombre o parte del nombre de la entidad
   * @param searchTerm - Término de búsqueda en los datos
   * @returns Array de registros que coinciden con la búsqueda
   */
  async queryPublicKnowledgeBase(
    companyId: string,
    category: string,
    searchTerm?: string,
  ): Promise<Record<string, unknown>[]> {
    const baseQuery = `
      SELECT dr.data
      FROM public.dynamic_records dr
      JOIN public.entity_definitions ed ON dr.entity_definition_id = ed.id
      WHERE ed.company_id = $1
        AND ed.entity_name ILIKE '%' || $2 || '%'
        AND ed.is_public_default = true  -- FILTRO CRÍTICO: Solo datos públicos
    `;

    if (searchTerm) {
      const result = await this.supabaseService.query<{
        data: Record<string, unknown>;
      }>(
        `${baseQuery}
        AND dr.data::text ILIKE '%' || $3 || '%'
        LIMIT 10`,
        [companyId, category, searchTerm],
      );
      return result.map((r) => r.data);
    }

    const result = await this.supabaseService.query<{
      data: Record<string, unknown>;
    }>(`${baseQuery} LIMIT 20`, [companyId, category]);
    return result.map((r) => r.data);
  }

  /**
   * Lista todas las entidades públicas de una empresa.
   */
  async listPublicEntities(companyId: string): Promise<string[]> {
    const result = await this.supabaseService.query<{ entity_name: string }>(
      `
      SELECT entity_name
      FROM public.entity_definitions
      WHERE company_id = $1 AND is_public_default = true
      ORDER BY entity_name
      `,
      [companyId],
    );
    return result.map((r) => r.entity_name);
  }
}
