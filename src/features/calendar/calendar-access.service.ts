import { ForbiddenException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import type { AuthJwtPayload } from '../auth/types/auth-jwt.types';

export type CalendarActorKind = 'admin' | 'staff' | 'customer' | 'system';

export interface CalendarActor {
  kind: CalendarActorKind;
  companyId: string;
  userId?: string;
  staffId?: string;
  phone?: string;
}

@Injectable()
export class CalendarAccessService {
  constructor(private readonly db: SupabaseService) {}

  async resolve(auth: AuthJwtPayload): Promise<CalendarActor> {
    const rows = await this.db.query<{
      role: string;
      phone: string | null;
      staff_id: string | null;
      staff_role: string | null;
    }>(
      `SELECT cu.role::text AS role, cu.phone,
              cs.id AS staff_id, cs.role::text AS staff_role
         FROM company_users cu
         LEFT JOIN company_staff cs
           ON cs.company_id = cu.company_id
          AND cs.user_id = cu.id
          AND cs.is_active = TRUE
        WHERE cu.id = $1 AND cu.company_id = $2
        LIMIT 1`,
      [auth.userId, auth.companyId],
    );
    const row = rows[0];
    const role = (row?.role || auth.role).toUpperCase();
    const staffRole = row?.staff_role?.toLowerCase();
    if (
      ['ADMIN', 'OWNER', 'ROLE_ADMIN'].includes(role) ||
      ['owner', 'admin', 'manager'].includes(staffRole ?? '')
    ) {
      return {
        kind: 'admin',
        companyId: auth.companyId,
        userId: auth.userId,
        staffId: row?.staff_id ?? undefined,
        phone: row?.phone ?? undefined,
      };
    }
    if (row?.staff_id) {
      return {
        kind: 'staff',
        companyId: auth.companyId,
        userId: auth.userId,
        staffId: row.staff_id,
        phone: row.phone ?? undefined,
      };
    }
    return {
      kind: 'customer',
      companyId: auth.companyId,
      userId: auth.userId,
      phone: row?.phone ?? undefined,
    };
  }

  customerFromPhone(companyId: string, phone: string): CalendarActor {
    return { kind: 'customer', companyId, phone };
  }

  assertAdmin(actor: CalendarActor): void {
    if (actor.kind !== 'admin') {
      throw new ForbiddenException(
        'Esta operación requiere rol administrativo',
      );
    }
  }

  assertCanManageStaff(actor: CalendarActor, staffId: string): void {
    if (actor.kind === 'admin') return;
    if (actor.kind === 'staff' && actor.staffId === staffId) return;
    throw new ForbiddenException('No puedes administrar este empleado');
  }

  assertCustomerPhone(actor: CalendarActor, requestedPhone?: string): string {
    if (actor.kind !== 'customer') {
      if (!requestedPhone) {
        throw new ForbiddenException('El teléfono del cliente es requerido');
      }
      return requestedPhone;
    }
    if (!actor.phone) {
      throw new ForbiddenException('La cuenta no tiene teléfono verificado');
    }
    if (
      requestedPhone &&
      this.normalizePhone(requestedPhone) !== this.normalizePhone(actor.phone)
    ) {
      throw new ForbiddenException('Solo puedes operar con tu propio teléfono');
    }
    return actor.phone;
  }

  async assertCanModifyAppointment(
    actor: CalendarActor,
    appointmentId: string,
  ): Promise<void> {
    if (actor.kind === 'admin') return;
    const rows = await this.db.query<{ allowed: boolean }>(
      `SELECT CASE
          WHEN $3 = 'staff' THEN a.staff_id = $4::uuid
          WHEN $3 = 'customer' THEN regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g')
            = regexp_replace(COALESCE($5, ''), '\\D', '', 'g')
          ELSE FALSE
        END AS allowed
       FROM appointments a
       LEFT JOIN customers c ON c.id = a.customer_id
       WHERE a.id = $1 AND a.company_id = $2
       LIMIT 1`,
      [
        appointmentId,
        actor.companyId,
        actor.kind,
        actor.staffId ?? null,
        actor.phone ?? null,
      ],
    );
    if (!rows[0]?.allowed) {
      throw new ForbiddenException('No puedes modificar esta cita');
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }
}
