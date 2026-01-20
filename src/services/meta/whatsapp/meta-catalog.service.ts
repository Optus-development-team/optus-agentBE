/**
 * Servicio de catálogo de Meta para WhatsApp Business.
 *
 * Responsabilidades:
 * - Sincronizar productos con el catálogo de Meta
 * - Listar y buscar productos
 * - Sincronización bidireccional con Supabase
 *
 * @moved-from src/whatsapp/services/meta-catalog.service.ts
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type {
  MetaProductItem,
  MetaBatchRequest,
  MetaBatchResponse,
  MetaCatalogListResponse,
  SyncInventoryResult,
} from '../../../dto/meta-catalog.dto';
import { SupabaseService } from '../../database/supabase.service';

interface SupabaseProduct {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  stock_quantity?: number;
  is_available: boolean;
  brand?: string;
  category?: string;
}

interface CompanyWithCatalog {
  id: string;
  business_catalog_id: string;
}

@Injectable()
export class MetaCatalogService implements OnModuleInit {
  private readonly logger = new Logger(MetaCatalogService.name);
  private readonly apiVersion: string;
  private readonly apiToken: string;
  private readonly syncOnStartup: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly supabase: SupabaseService,
  ) {
    this.apiVersion = this.configService.get<string>(
      'WHATSAPP_API_VERSION',
      'v24.0',
    );
    this.apiToken = this.configService.get<string>('META_API_TOKEN', '');
    this.syncOnStartup =
      this.configService.get<string>('CATALOG_SYNC_ON_STARTUP', 'true') ===
      'true';
  }

  /**
   * Hook que se ejecuta al iniciar el módulo.
   * Sincroniza productos de todos los catálogos de Meta hacia Supabase.
   */
  async onModuleInit(): Promise<void> {
    if (!this.syncOnStartup) {
      this.logger.log(
        'Sincronización de catálogo al inicio deshabilitada (CATALOG_SYNC_ON_STARTUP=false)',
      );
      return;
    }

    if (!this.apiToken) {
      this.logger.warn(
        'META_API_TOKEN no configurado. Sincronización de catálogo omitida.',
      );
      return;
    }

    if (!this.supabase.isEnabled()) {
      this.logger.warn(
        'Supabase no habilitado. Sincronización de catálogo omitida.',
      );
      return;
    }

    this.logger.log(
      'Iniciando sincronización de catálogos de Meta al iniciar el backend...',
    );
    await this.syncAllCatalogs();
  }

  /**
   * Sincroniza todos los catálogos de todas las compañías que tienen business_catalog_id configurado.
   */
  async syncAllCatalogs(): Promise<{
    total: number;
    synced: number;
    errors: number;
  }> {
    try {
      // Obtener todas las compañías con catálogo configurado
      const companies = await this.supabase.query<CompanyWithCatalog>(
        `SELECT id, business_catalog_id FROM companies WHERE business_catalog_id IS NOT NULL AND business_catalog_id != ''`,
      );

      if (!companies || companies.length === 0) {
        this.logger.log('No hay compañías con catálogo de Meta configurado.');
        return { total: 0, synced: 0, errors: 0 };
      }

      this.logger.log(
        `Sincronizando catálogos de ${companies.length} compañías...`,
      );

      let totalSynced = 0;
      let totalErrors = 0;

      for (const company of companies) {
        try {
          const result = await this.syncInventoryFromMeta(company.id);
          if (result) {
            totalSynced += result.synced;
            totalErrors += result.errors;
            this.logger.log(
              `Catálogo de ${company.id} sincronizado: ${result.synced} productos, ${result.errors} errores`,
            );
          }
        } catch (error) {
          totalErrors++;
          this.logger.error(
            `Error sincronizando catálogo de ${company.id}:`,
            error,
          );
        }
      }

      this.logger.log(
        `Sincronización de catálogos completada: ${companies.length} compañías, ${totalSynced} productos sincronizados, ${totalErrors} errores`,
      );

      return {
        total: companies.length,
        synced: totalSynced,
        errors: totalErrors,
      };
    } catch (error) {
      this.logger.error('Error sincronizando catálogos:', error);
      return { total: 0, synced: 0, errors: 1 };
    }
  }

  /**
   * Obtiene el business_catalog_id de la compañía desde Supabase
   */
  async getCatalogId(companyId: string): Promise<string | null> {
    try {
      const result = await this.supabase.query<{
        business_catalog_id: string;
      }>('SELECT business_catalog_id FROM companies WHERE id = $1 LIMIT 1', [
        companyId,
      ]);

      if (!result || result.length === 0) {
        this.logger.error(`No se encontró compañía con id ${companyId}`);
        return null;
      }

      return result[0]?.business_catalog_id || null;
    } catch (error) {
      this.logger.error('Error en getCatalogId:', error);
      return null;
    }
  }

  /**
   * Lista todos los productos del catálogo de Meta
   */
  async listCatalogProducts(
    catalogId: string,
    filter?: Record<string, unknown>,
  ): Promise<MetaCatalogListResponse | null> {
    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${catalogId}/products`;
      const params: Record<string, string> = {
        access_token: this.apiToken,
        fields: 'retailer_id,id,name,price,availability,image_url,inventory',
      };

      if (filter) {
        params.filter = JSON.stringify(filter);
      }

      const response = await firstValueFrom(
        this.httpService.get<MetaCatalogListResponse>(url, { params }),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error listando productos del catálogo:', error);
      return null;
    }
  }

  /**
   * Crea o actualiza productos en el catálogo de Meta usando batch API
   */
  async batchUpdateProducts(
    catalogId: string,
    requests: MetaBatchRequest[],
  ): Promise<MetaBatchResponse | null> {
    try {
      const url = `https://graph.facebook.com/${this.apiVersion}/${catalogId}/items_batch`;

      const formattedRequests = requests.map((req) => ({
        method: req.method,
        retailer_id: req.retailer_id,
        data: req.data,
      }));

      const response = await firstValueFrom(
        this.httpService.post<MetaBatchResponse>(
          url,
          {
            item_type: 'PRODUCT_ITEM',
            requests: JSON.stringify(formattedRequests),
          },
          {
            params: { access_token: this.apiToken },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error en batch update:', error);
      return null;
    }
  }

  /**
   * Sincroniza productos desde Supabase hacia el catálogo de Meta
   */
  async syncInventoryToMeta(
    companyId: string,
  ): Promise<SyncInventoryResult | null> {
    try {
      const catalogId = await this.getCatalogId(companyId);
      if (!catalogId) {
        this.logger.warn(`No se encontró catalog_id para ${companyId}`);
        return null;
      }

      // Obtener productos de Supabase
      const products = await this.supabase.query<SupabaseProduct>(
        'SELECT * FROM products WHERE company_id = $1',
        [companyId],
      );

      if (!products || products.length === 0) {
        this.logger.warn('No se encontraron productos en Supabase');
        return {
          synced: 0,
          errors: 0,
          warnings: 0,
          details: [],
        };
      }

      // Convertir productos de Supabase a formato Meta
      const batchRequests: MetaBatchRequest[] = products.map((product) =>
        this.convertToMetaProduct(product),
      );

      // Enviar batch update a Meta
      const response = await this.batchUpdateProducts(catalogId, batchRequests);

      if (!response) {
        return null;
      }

      // Procesar resultados
      const result: SyncInventoryResult = {
        synced: 0,
        errors: 0,
        warnings: 0,
        details: [],
      };

      response.validation_status.forEach((status) => {
        if (status.errors && status.errors.length > 0) {
          result.errors++;
          result.details.push({
            retailer_id: status.retailer_id,
            status: 'error',
            message: status.errors.map((e) => e.message).join(', '),
          });
        } else if (status.warnings && status.warnings.length > 0) {
          result.warnings++;
          result.synced++;
          result.details.push({
            retailer_id: status.retailer_id,
            status: 'warning',
            message: status.warnings.map((w) => w.message).join(', '),
          });
        } else {
          result.synced++;
          result.details.push({
            retailer_id: status.retailer_id,
            status: 'success',
          });
        }
      });

      return result;
    } catch (error) {
      this.logger.error('Error sincronizando inventario:', error);
      return null;
    }
  }

  /**
   * Sincroniza productos desde el catálogo de Meta hacia Supabase
   */
  async syncInventoryFromMeta(
    companyId: string,
  ): Promise<{ synced: number; errors: number } | null> {
    try {
      const catalogId = await this.getCatalogId(companyId);
      if (!catalogId) {
        this.logger.warn(`No se encontró catalog_id para ${companyId}`);
        return null;
      }

      // Obtener productos de Meta
      const metaProducts = await this.listCatalogProducts(catalogId);
      if (!metaProducts?.data) {
        this.logger.warn('No se pudieron obtener productos de Meta');
        return null;
      }

      let synced = 0;
      let errors = 0;

      // Actualizar cada producto en Supabase
      for (const metaProduct of metaProducts.data) {
        try {
          await this.supabase.query(
            `INSERT INTO products (id, company_id, name, price, image_url, stock_quantity, is_available)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               price = EXCLUDED.price,
               image_url = EXCLUDED.image_url,
               stock_quantity = EXCLUDED.stock_quantity,
               is_available = EXCLUDED.is_available,
               updated_at = NOW()`,
            [
              metaProduct.retailer_id,
              companyId,
              metaProduct.name,
              parseFloat(metaProduct.price.split(' ')[0]) || 0,
              metaProduct.image_url || null,
              metaProduct.inventory || 0,
              metaProduct.availability === 'in stock',
            ],
          );
          synced++;
        } catch (error) {
          this.logger.error(
            `Error actualizando producto ${metaProduct.retailer_id}:`,
            error,
          );
          errors++;
        }
      }

      return { synced, errors };
    } catch (error) {
      this.logger.error('Error sincronizando desde Meta:', error);
      return null;
    }
  }

  /**
   * Busca productos en el catálogo de Meta por nombre
   */
  async searchProducts(
    catalogId: string,
    searchTerm: string,
  ): Promise<MetaCatalogListResponse | null> {
    const filter = {
      name: { i_contains: searchTerm },
    };
    return this.listCatalogProducts(catalogId, filter);
  }

  /**
   * Obtiene información de un producto específico
   */
  async getProductInfo(
    catalogId: string,
    retailerId: string,
  ): Promise<MetaCatalogListResponse | null> {
    const filter = {
      retailer_id: { eq: retailerId },
    };
    return this.listCatalogProducts(catalogId, filter);
  }

  /**
   * Convierte un producto de Supabase al formato de Meta
   */
  private convertToMetaProduct(product: SupabaseProduct): MetaBatchRequest {
    const metaProduct: MetaProductItem = {
      id: product.id,
      title: product.name,
      description: product.description || '',
      price: `${product.price.toFixed(2)} MXN`,
      availability: product.is_available ? 'in stock' : 'out of stock',
      condition: 'new',
      image_link: product.image_url,
      brand: product.brand,
      category: product.category,
      inventory: product.stock_quantity,
    };

    return {
      method: 'UPDATE',
      retailer_id: product.id,
      data: metaProduct,
    };
  }
}
