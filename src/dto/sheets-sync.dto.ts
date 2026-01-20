/**
 * DTOs para sincronización de Google Sheets.
 * Payload recibido desde el Google Workspace Add-on.
 *
 * @see https://developers.google.com/apps-script/guides/triggers
 */
import {
  IsString,
  IsBoolean,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Representa una fila de datos del spreadsheet convertida a objeto.
 */
export class SheetRowDto {
  /**
   * ID externo opcional (número de fila en el spreadsheet).
   */
  @IsString()
  @IsOptional()
  _rowId?: string;

  /**
   * Datos dinámicos de la fila.
   * Las keys corresponden a los headers del spreadsheet.
   */
  [key: string]: unknown;
}

/**
 * Payload principal enviado por el Google Workspace Add-on.
 *
 * @example
 * {
 *   "company_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
 *   "sheet_name": "[PRIV] Costos Internos",
 *   "is_public": false,
 *   "data": [
 *     { "_rowId": "2", "producto": "Widget", "costo": "150.00" },
 *     { "_rowId": "3", "producto": "Gadget", "costo": "200.00" }
 *   ]
 * }
 */
export class SheetsSyncPayloadDto {
  /**
   * UUID de la empresa propietaria de los datos.
   */
  @IsUUID()
  company_id: string;

  /**
   * Nombre de la hoja de cálculo.
   * Si empieza con "[PRIV]", los datos se marcan como privados.
   */
  @IsString()
  sheet_name: string;

  /**
   * Indica si los datos son públicos (accesibles por el Agente IA).
   * Calculado por el Add-on basándose en el prefijo "[PRIV]".
   */
  @IsBoolean()
  is_public: boolean;

  /**
   * Array de filas del spreadsheet convertidas a objetos JSON.
   */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SheetRowDto)
  data: SheetRowDto[];

  /**
   * Metadatos opcionales del spreadsheet.
   */
  @IsObject()
  @IsOptional()
  metadata?: {
    spreadsheet_id?: string;
    spreadsheet_name?: string;
    last_updated?: string;
  };
}

/**
 * Respuesta del endpoint de sincronización.
 */
export class SheetsSyncResponseDto {
  success: boolean;
  message: string;
  entity_definition_id?: string;
  records_synced?: number;
  errors?: string[];
}
