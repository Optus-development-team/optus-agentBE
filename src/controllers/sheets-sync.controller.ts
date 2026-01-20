/**
 * Controlador para recibir webhooks de sincronización desde Google Sheets.
 *
 * Endpoint: POST /v1/webhooks/sheets/sync
 * Seguridad: Validación de header x-optus-secret
 *
 * @see https://developers.google.com/apps-script/guides/triggers
 */
import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SheetsSyncService } from '../services/sheets-sync/sheets-sync.service';
import {
  SheetsSyncPayloadDto,
  SheetsSyncResponseDto,
} from '../dto/sheets-sync.dto';

@Controller('v1/webhooks/sheets')
export class SheetsSyncController {
  private readonly logger = new Logger(SheetsSyncController.name);
  private readonly webhookSecret: string | undefined;

  constructor(
    private readonly sheetsSyncService: SheetsSyncService,
    private readonly configService: ConfigService,
  ) {
    this.webhookSecret = this.configService.get<string>(
      'SHEETS_WEBHOOK_SECRET',
    );
  }

  /**
   * Endpoint para recibir datos sincronizados desde Google Sheets.
   *
   * @param secret - Header de autenticación x-optus-secret
   * @param payload - Datos del spreadsheet
   * @returns Resultado de la sincronización
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncSheetData(
    @Headers('x-optus-secret') secret: string | undefined,
    @Body() payload: SheetsSyncPayloadDto,
  ): Promise<SheetsSyncResponseDto> {
    // Validar secret
    if (!this.validateSecret(secret)) {
      this.logger.warn('Intento de sincronización con secret inválido');
      throw new UnauthorizedException('Invalid secret');
    }

    // Validar payload mínimo
    if (!payload.company_id || !payload.sheet_name) {
      throw new BadRequestException('company_id and sheet_name are required');
    }

    if (!Array.isArray(payload.data)) {
      throw new BadRequestException('data must be an array');
    }

    this.logger.log(
      `Recibida sincronización: ${payload.sheet_name} (${payload.data.length} filas) para empresa ${payload.company_id}`,
    );

    return this.sheetsSyncService.syncSheetData(payload);
  }

  /**
   * Valida el secret del webhook.
   * Si no hay secret configurado en el servidor, acepta cualquier request (desarrollo).
   */
  private validateSecret(providedSecret: string | undefined): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        'SHEETS_WEBHOOK_SECRET no configurado - aceptando todas las requests (modo desarrollo)',
      );
      return true;
    }

    return providedSecret === this.webhookSecret;
  }
}
