import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import type { SqlExecutor } from '../../common/intraestructure/supabase/supabase.service';

@Injectable()
export class BookingManagementService {
  constructor(private readonly db: SupabaseService) {}

  listServices(companyId: string) {
    return this.db.query(
      `SELECT id, name, description, category, duration_minutes,
              capacity, sale_price, currency, is_active, is_bookable
         FROM catalog_items
        WHERE company_id = $1 AND item_type = 'service'
        ORDER BY is_active DESC, name`,
      [companyId],
    );
  }

  async createService(
    companyId: string,
    input: {
      name: string;
      description?: string;
      category?: string;
      durationMinutes: number;
      capacity?: number;
      salePrice?: number;
      currency?: string;
    },
  ) {
    const rows = await this.db.query(
      `INSERT INTO catalog_items (
         company_id, item_type, name, description, category,
         duration_minutes, capacity, sale_price, currency,
         is_active, is_bookable, is_sellable
       ) VALUES ($1, 'service', $2, $3, $4, $5, $6, $7, $8, TRUE, TRUE, TRUE)
       RETURNING *`,
      [
        companyId,
        input.name,
        input.description ?? null,
        input.category ?? null,
        input.durationMinutes,
        input.capacity ?? 1,
        input.salePrice ?? 0,
        input.currency ?? 'BOB',
      ],
    );
    return rows[0];
  }

  async updateService(
    companyId: string,
    serviceId: string,
    input: {
      name?: string;
      description?: string;
      category?: string;
      durationMinutes?: number;
      capacity?: number;
      salePrice?: number;
      currency?: string;
      isActive?: boolean;
      isBookable?: boolean;
    },
  ) {
    const rows = await this.db.query(
      `UPDATE catalog_items SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         category = COALESCE($5, category),
         duration_minutes = COALESCE($6, duration_minutes),
         capacity = COALESCE($7, capacity),
         sale_price = COALESCE($8, sale_price),
         currency = COALESCE($9, currency),
         is_active = COALESCE($10, is_active),
         is_bookable = COALESCE($11, is_bookable),
         updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND item_type = 'service'
       RETURNING *`,
      [
        serviceId,
        companyId,
        input.name ?? null,
        input.description ?? null,
        input.category ?? null,
        input.durationMinutes ?? null,
        input.capacity ?? null,
        input.salePrice ?? null,
        input.currency ?? null,
        input.isActive ?? null,
        input.isBookable ?? null,
      ],
    );
    if (!rows[0]) throw new NotFoundException('Servicio no encontrado');
    return rows[0];
  }

  listStaff(companyId: string) {
    return this.db.query(
      `SELECT cs.*,
              COALESCE(jsonb_agg(jsonb_build_object(
                'serviceId', scs.catalog_item_id,
                'customDurationMinutes', scs.custom_duration_minutes
              )) FILTER (WHERE scs.id IS NOT NULL), '[]'::jsonb) AS services
         FROM company_staff cs
         LEFT JOIN staff_catalog_services scs
           ON scs.staff_id = cs.id AND scs.is_active = TRUE
        WHERE cs.company_id = $1
        GROUP BY cs.id ORDER BY cs.is_active DESC, cs.first_name`,
      [companyId],
    );
  }

  async createStaff(
    companyId: string,
    input: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
      role: string;
      specialty?: string;
      userId?: string;
    },
  ) {
    if (input.userId) {
      const user = await this.db.query<{ id: string }>(
        `SELECT id FROM company_users WHERE id = $1 AND company_id = $2 LIMIT 1`,
        [input.userId, companyId],
      );
      if (!user[0]) {
        throw new BadRequestException('El usuario no pertenece a la empresa');
      }
    }
    const rows = await this.db.query(
      `INSERT INTO company_staff (
         company_id, first_name, last_name, email, phone,
         role, specialty, user_id, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6::staff_role, $7, $8, TRUE)
       RETURNING *`,
      [
        companyId,
        input.firstName,
        input.lastName ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.role,
        input.specialty ?? null,
        input.userId ?? null,
      ],
    );
    return rows[0];
  }

  async updateStaff(
    companyId: string,
    staffId: string,
    input: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      specialty?: string;
      isActive?: boolean;
      calendarSyncEnabled?: boolean;
    },
  ) {
    const rows = await this.db.query(
      `UPDATE company_staff SET
         first_name = COALESCE($3, first_name),
         last_name = COALESCE($4, last_name),
         email = COALESCE($5, email), phone = COALESCE($6, phone),
         specialty = COALESCE($7, specialty),
         is_active = COALESCE($8, is_active),
         calendar_sync_enabled = COALESCE($9, calendar_sync_enabled),
         updated_at = NOW()
       WHERE id = $1 AND company_id = $2 RETURNING *`,
      [
        staffId,
        companyId,
        input.firstName ?? null,
        input.lastName ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.specialty ?? null,
        input.isActive ?? null,
        input.calendarSyncEnabled ?? null,
      ],
    );
    if (!rows[0]) throw new NotFoundException('Empleado no encontrado');
    return rows[0];
  }

  async setStaffServices(
    companyId: string,
    staffId: string,
    services: Array<{ serviceId: string; customDurationMinutes?: number }>,
  ) {
    return this.db.withTransaction(async (transaction) => {
      await this.ensureStaff(companyId, staffId, transaction);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `staff-services:${companyId}:${staffId}`,
      ]);
      await transaction.query(
        `UPDATE staff_catalog_services SET is_active = FALSE, updated_at = NOW()
          WHERE company_id = $1 AND staff_id = $2`,
        [companyId, staffId],
      );
      for (const service of services) {
        const valid = await transaction.query<{ id: string }>(
          `SELECT id FROM catalog_items WHERE id = $1 AND company_id = $2
            AND item_type = 'service' AND is_active = TRUE`,
          [service.serviceId, companyId],
        );
        if (!valid.length) throw new BadRequestException('Servicio inválido');
        await transaction.query(
          `INSERT INTO staff_catalog_services (
             company_id, staff_id, catalog_item_id, custom_duration_minutes, is_active
           ) VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (staff_id, catalog_item_id) DO UPDATE
             SET custom_duration_minutes = EXCLUDED.custom_duration_minutes,
                 is_active = TRUE, updated_at = NOW()`,
          [
            companyId,
            staffId,
            service.serviceId,
            service.customDurationMinutes ?? null,
          ],
        );
      }
      return { updated: true, count: services.length };
    });
  }

  async setWorkingHours(
    companyId: string,
    staffId: string,
    hours: Array<{
      dayOfWeek: number;
      start: string;
      end: string;
      effectiveFrom?: string;
      effectiveTo?: string;
    }>,
  ) {
    this.validateWorkingHours(hours);
    return this.db.withTransaction(async (transaction) => {
      await this.ensureStaff(companyId, staffId, transaction);
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `staff-hours:${companyId}:${staffId}`,
      ]);
      await transaction.query(
        `UPDATE staff_working_hours SET is_active = FALSE, updated_at = NOW()
          WHERE company_id = $1 AND staff_id = $2`,
        [companyId, staffId],
      );
      for (const hour of hours) {
        if (hour.start >= hour.end) {
          throw new BadRequestException(
            'El horario de inicio debe ser menor al final',
          );
        }
        await transaction.query(
          `INSERT INTO staff_working_hours (
             company_id, staff_id, day_of_week, start_time, end_time,
             effective_from, effective_to
           ) VALUES ($1, $2, $3, $4::time, $5::time, $6::date, $7::date)`,
          [
            companyId,
            staffId,
            hour.dayOfWeek,
            hour.start,
            hour.end,
            hour.effectiveFrom ?? null,
            hour.effectiveTo ?? null,
          ],
        );
      }
      return { updated: true, count: hours.length };
    });
  }

  listWorkingHours(companyId: string, staffId: string) {
    return this.db.query(
      `SELECT * FROM staff_working_hours
        WHERE company_id = $1 AND staff_id = $2 AND is_active = TRUE
        ORDER BY day_of_week, start_time`,
      [companyId, staffId],
    );
  }

  async createTimeOff(
    companyId: string,
    staffId: string,
    userId: string | undefined,
    input: { startsAt: string; endsAt: string; reason?: string },
  ) {
    if (new Date(input.startsAt) >= new Date(input.endsAt)) {
      throw new BadRequestException('Rango de ausencia inválido');
    }
    await this.ensureStaff(companyId, staffId, this.db);
    const rows = await this.db.query(
      `INSERT INTO staff_time_off (
         company_id, staff_id, starts_at, ends_at, reason, created_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        companyId,
        staffId,
        input.startsAt,
        input.endsAt,
        input.reason ?? null,
        userId ?? null,
      ],
    );
    return rows[0];
  }

  listTimeOff(companyId: string, staffId?: string) {
    return this.db.query(
      `SELECT * FROM staff_time_off
        WHERE company_id = $1 AND ($2::uuid IS NULL OR staff_id = $2)
        ORDER BY starts_at DESC`,
      [companyId, staffId ?? null],
    );
  }

  async cancelTimeOff(companyId: string, timeOffId: string, staffId?: string) {
    const rows = await this.db.query(
      `UPDATE staff_time_off SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND company_id = $2
          AND ($3::uuid IS NULL OR staff_id = $3) RETURNING *`,
      [timeOffId, companyId, staffId ?? null],
    );
    if (!rows[0]) throw new NotFoundException('Ausencia no encontrada');
    return rows[0];
  }

  listCalendars(companyId: string) {
    return this.db.query(
      `SELECT r.*, cs.first_name, cs.last_name
         FROM google_calendar_registry r
         LEFT JOIN company_staff cs ON cs.id = r.assigned_to_staff_id
        WHERE r.company_id = $1 ORDER BY r.is_active DESC, r.is_primary DESC`,
      [companyId],
    );
  }

  async registerCalendar(
    companyId: string,
    input: {
      calendarId: string;
      calendarName: string;
      calendarType: string;
      staffId?: string;
      isPrimary?: boolean;
      color?: string;
    },
  ) {
    return this.db.withTransaction(async (transaction) => {
      await transaction.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `calendar-registry:${companyId}`,
      ]);
      if (input.staffId)
        await this.ensureStaff(companyId, input.staffId, transaction);
      if (input.isPrimary) {
        await transaction.query(
          `UPDATE google_calendar_registry SET is_primary = FALSE, updated_at = NOW()
            WHERE company_id = $1 AND is_primary = TRUE`,
          [companyId],
        );
      }
      const rows = await transaction.query(
        `INSERT INTO google_calendar_registry (
           company_id, calendar_id, calendar_name, calendar_type,
           calendar_color, is_primary, assigned_to_staff_id, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         ON CONFLICT (company_id, calendar_id) DO UPDATE SET
           calendar_name = EXCLUDED.calendar_name,
           calendar_type = EXCLUDED.calendar_type,
           calendar_color = EXCLUDED.calendar_color,
           is_primary = EXCLUDED.is_primary,
           assigned_to_staff_id = EXCLUDED.assigned_to_staff_id,
           is_active = TRUE, updated_at = NOW()
         RETURNING *`,
        [
          companyId,
          input.calendarId,
          input.calendarName,
          input.calendarType,
          input.color ?? null,
          input.isPrimary ?? false,
          input.staffId ?? null,
        ],
      );
      if (input.staffId) {
        await transaction.query(
          `UPDATE company_staff
              SET google_calendar_id = $3, google_calendar_name = $4,
                  calendar_color = $5, calendar_sync_enabled = TRUE,
                  updated_at = NOW()
            WHERE id = $1 AND company_id = $2`,
          [
            input.staffId,
            companyId,
            input.calendarId,
            input.calendarName,
            input.color ?? null,
          ],
        );
      }
      return rows[0];
    });
  }

  private async ensureStaff(
    companyId: string,
    staffId: string,
    executor: SqlExecutor,
  ): Promise<void> {
    const rows = await executor.query(
      `SELECT id FROM company_staff WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [staffId, companyId],
    );
    if (!rows.length) throw new NotFoundException('Empleado no encontrado');
  }

  private validateWorkingHours(
    hours: Array<{ dayOfWeek: number; start: string; end: string }>,
  ): void {
    const byDay = new Map<number, Array<{ start: string; end: string }>>();
    for (const hour of hours) {
      if (hour.start >= hour.end) {
        throw new BadRequestException(
          'El horario de inicio debe ser menor al final',
        );
      }
      const intervals = byDay.get(hour.dayOfWeek) ?? [];
      if (
        intervals.some(
          (existing) => hour.start < existing.end && hour.end > existing.start,
        )
      ) {
        throw new BadRequestException(
          `Existen horarios solapados para el día ${hour.dayOfWeek}`,
        );
      }
      intervals.push(hour);
      byDay.set(hour.dayOfWeek, intervals);
    }
  }
}
