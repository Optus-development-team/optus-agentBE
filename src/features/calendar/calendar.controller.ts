import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';
import { FullCookieJwtAuthGuard } from '../auth/full-cookie-jwt-auth.guard';
import type { FullAuthenticatedRequest } from '../auth/full-cookie-jwt-auth.guard';
import { OAuthService } from '../auth/oauth.service';
import { AppointmentsService } from './appointments.service';
import {
  CalendarAccessService,
  type CalendarActor,
} from './calendar-access.service';
import { CalendarSyncService } from './calendar-sync.service';
import {
  AvailabilityQueryDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  ListAppointmentsQueryDto,
  RescheduleAppointmentDto,
  ResolveConflictDto,
} from './dto/calendar.dto';
import { AppointmentStatusDto } from './dto/calendar-admin.dto';
import { GoogleCalendarWebhookService } from './google-calendar-webhook.service';

@ApiTags('calendar')
@Controller('calendar')
@UseGuards(FullCookieJwtAuthGuard)
export class CalendarController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly sync: CalendarSyncService,
    private readonly webhooks: GoogleCalendarWebhookService,
    private readonly oauth: OAuthService,
    private readonly db: SupabaseService,
    private readonly access: CalendarAccessService,
  ) {}

  @Get('connect')
  @ApiOperation({
    summary: 'Conecta Google Calendar para la empresa autenticada',
  })
  async connect(
    @Req() request: FullAuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    response.redirect(this.oauth.getAuthUrl(actor.companyId));
  }

  @Post('appointments')
  @ApiOperation({ summary: 'Crea una cita en DB y la sincroniza con Google' })
  async create(
    @Req() request: FullAuthenticatedRequest,
    @Body() body: CreateAppointmentDto,
  ) {
    const actor = await this.actor(request);
    return this.appointments.create(
      { companyId: actor.companyId, ...body },
      actor,
    );
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Lista citas reales de un cliente' })
  async list(
    @Req() request: FullAuthenticatedRequest,
    @Query() query: ListAppointmentsQueryDto,
  ) {
    const actor = await this.actor(request);
    return this.appointments.list(
      actor,
      query.status,
      query.limit,
      query.phone,
    );
  }

  @Get('availability')
  @ApiOperation({ summary: 'Consulta ocupación para un rango de tiempo' })
  availability(
    @Req() request: FullAuthenticatedRequest,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.appointments.availability({
      companyId: this.companyId(request),
      date: query.date,
      serviceId: query.serviceId,
      staffId: query.staffId,
      durationMinutes: query.durationMinutes,
    });
  }

  @Patch('appointments/:id/reschedule')
  @ApiOperation({ summary: 'Reprograma una cita en DB y Google' })
  async reschedule(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') appointmentId: string,
    @Body() body: RescheduleAppointmentDto,
  ) {
    const actor = await this.actor(request);
    return this.appointments.reschedule(
      actor.companyId,
      appointmentId,
      body.start,
      body.end,
      actor,
    );
  }

  @Post('appointments/:id/cancel')
  @ApiOperation({ summary: 'Cancela una cita en DB y Google' })
  async cancel(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') appointmentId: string,
    @Body() body: CancelAppointmentDto,
  ) {
    const actor = await this.actor(request);
    return this.appointments.cancel(
      actor.companyId,
      appointmentId,
      body.reason,
      actor,
    );
  }

  @Patch('appointments/:id/status')
  @ApiOperation({ summary: 'Confirma, completa o marca inasistencia' })
  async updateAppointmentStatus(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') appointmentId: string,
    @Body() body: AppointmentStatusDto,
  ) {
    const actor = await this.actor(request);
    return this.appointments.updateStatus(
      actor.companyId,
      appointmentId,
      body.status,
      actor,
    );
  }

  @Post('sync')
  @ApiOperation({ summary: 'Ejecuta sincronización bidireccional manual' })
  async forceSync(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.sync.performFullSync(actor.companyId, 'user');
  }

  @Post('webhooks/setup')
  @ApiOperation({
    summary: 'Configura webhooks para todos los calendarios activos',
  })
  async setupWebhooks(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.webhooks.setup(actor.companyId);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Obtiene salud, logs y conflictos de sincronización',
  })
  async status(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    const companyId = actor.companyId;
    const [health, logs, conflicts] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT * FROM v_company_sync_health WHERE company_id = $1`,
        [companyId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT * FROM calendar_sync_logs WHERE company_id = $1
          ORDER BY created_at DESC LIMIT 20`,
        [companyId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT * FROM calendar_sync_conflicts
          WHERE company_id = $1 AND resolution_status = 'pending'
          ORDER BY created_at DESC LIMIT 50`,
        [companyId],
      ),
    ]);
    return { health: health[0] ?? null, logs, conflicts };
  }

  @Post('conflicts/:id/resolve')
  @ApiOperation({
    summary: 'Resuelve un conflicto de sincronización pendiente',
  })
  async resolveConflict(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') conflictId: string,
    @Body() body: ResolveConflictDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    const userId = actor.userId;
    if (!userId) throw new UnauthorizedException('Usuario no autenticado');
    return this.sync.resolveConflictById(
      actor.companyId,
      conflictId,
      body.strategy,
      userId,
      body.notes,
    );
  }

  private companyId(request: FullAuthenticatedRequest): string {
    const companyId = request.auth?.companyId;
    if (!companyId) throw new UnauthorizedException('Empresa no autenticada');
    return companyId;
  }

  private actor(request: FullAuthenticatedRequest): Promise<CalendarActor> {
    if (!request.auth)
      throw new UnauthorizedException('Usuario no autenticado');
    return this.access.resolve(request.auth);
  }
}
