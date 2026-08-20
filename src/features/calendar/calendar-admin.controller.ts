import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FullCookieJwtAuthGuard } from '../auth/full-cookie-jwt-auth.guard';
import type { FullAuthenticatedRequest } from '../auth/full-cookie-jwt-auth.guard';
import { OAuthService } from '../auth/oauth.service';
import { BookingManagementService } from './booking-management.service';
import { BookingPolicyService } from './booking-policy.service';
import {
  BookingPolicyDto,
  CreateBookableServiceDto,
  CreateStaffDto,
  CreateTimeOffDto,
  RegisterCalendarDto,
  SetStaffServicesDto,
  SetWorkingHoursDto,
  UpdateBookableServiceDto,
  UpdateStaffDto,
} from './dto/calendar-admin.dto';
import {
  CalendarAccessService,
  type CalendarActor,
} from './calendar-access.service';
import { GoogleCalendarWebhookService } from './google-calendar-webhook.service';

@ApiTags('calendar-admin')
@Controller('calendar/admin')
@UseGuards(FullCookieJwtAuthGuard)
export class CalendarAdminController {
  constructor(
    private readonly access: CalendarAccessService,
    private readonly policies: BookingPolicyService,
    private readonly management: BookingManagementService,
    private readonly oauth: OAuthService,
    private readonly webhooks: GoogleCalendarWebhookService,
  ) {}

  @Get('settings')
  async getSettings(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.policies.get(actor.companyId);
  }

  @Put('settings')
  async updateSettings(
    @Req() request: FullAuthenticatedRequest,
    @Body() body: BookingPolicyDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.policies.update(actor.companyId, body);
  }

  @Get('services')
  async listServices(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.listServices(actor.companyId);
  }

  @Post('services')
  async createService(
    @Req() request: FullAuthenticatedRequest,
    @Body() body: CreateBookableServiceDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.createService(actor.companyId, body);
  }

  @Patch('services/:id')
  async updateService(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') serviceId: string,
    @Body() body: UpdateBookableServiceDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.updateService(actor.companyId, serviceId, body);
  }

  @Get('staff')
  async listStaff(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.listStaff(actor.companyId);
  }

  @Post('staff')
  async createStaff(
    @Req() request: FullAuthenticatedRequest,
    @Body() body: CreateStaffDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.createStaff(actor.companyId, body);
  }

  @Patch('staff/:id')
  async updateStaff(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') staffId: string,
    @Body() body: UpdateStaffDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.updateStaff(actor.companyId, staffId, body);
  }

  @Put('staff/:id/services')
  async setStaffServices(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') staffId: string,
    @Body() body: SetStaffServicesDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.setStaffServices(
      actor.companyId,
      staffId,
      body.services,
    );
  }

  @Get('staff/:id/hours')
  async getWorkingHours(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') staffId: string,
  ) {
    const actor = await this.actor(request);
    this.access.assertCanManageStaff(actor, staffId);
    return this.management.listWorkingHours(actor.companyId, staffId);
  }

  @Put('staff/:id/hours')
  async setWorkingHours(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') staffId: string,
    @Body() body: SetWorkingHoursDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertCanManageStaff(actor, staffId);
    return this.management.setWorkingHours(
      actor.companyId,
      staffId,
      body.hours,
    );
  }

  @Get('time-off')
  async listTimeOff(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    if (actor.kind === 'customer') {
      throw new ForbiddenException(
        'Esta operación requiere ser empleado o administrador',
      );
    }
    return this.management.listTimeOff(
      actor.companyId,
      actor.kind === 'staff' ? actor.staffId : undefined,
    );
  }

  @Post('staff/:id/time-off')
  async createTimeOff(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') staffId: string,
    @Body() body: CreateTimeOffDto,
  ) {
    const actor = await this.actor(request);
    if (actor.kind === 'customer') {
      throw new ForbiddenException(
        'Esta operación requiere ser empleado o administrador',
      );
    }
    this.access.assertCanManageStaff(actor, staffId);
    return this.management.createTimeOff(
      actor.companyId,
      staffId,
      actor.userId,
      body,
    );
  }

  @Delete('time-off/:id')
  async cancelTimeOff(
    @Req() request: FullAuthenticatedRequest,
    @Param('id') timeOffId: string,
  ) {
    const actor = await this.actor(request);
    return this.management.cancelTimeOff(
      actor.companyId,
      timeOffId,
      actor.kind === 'staff' ? actor.staffId : undefined,
    );
  }

  @Get('calendars')
  async listCalendars(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.listCalendars(actor.companyId);
  }

  @Post('calendars')
  async registerCalendar(
    @Req() request: FullAuthenticatedRequest,
    @Body() body: RegisterCalendarDto,
  ) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return this.management.registerCalendar(actor.companyId, body);
  }

  @Get('integration')
  async integrationStatus(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    return { connected: await this.oauth.checkCredentials(actor.companyId) };
  }

  @Delete('integration')
  @ApiOperation({
    summary: 'Desconecta Google Calendar y detiene sus webhooks',
  })
  async disconnect(@Req() request: FullAuthenticatedRequest) {
    const actor = await this.actor(request);
    this.access.assertAdmin(actor);
    await this.webhooks.stopAll(actor.companyId);
    await this.oauth.disconnectCalendar(actor.companyId);
    return { disconnected: true };
  }

  private actor(request: FullAuthenticatedRequest): Promise<CalendarActor> {
    if (!request.auth)
      throw new UnauthorizedException('Usuario no autenticado');
    return this.access.resolve(request.auth);
  }
}
