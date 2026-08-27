import { Injectable, Logger } from '@nestjs/common';
import { AppointmentsService } from '../../../../../features/calendar/appointments.service';
import { FunctionTool } from '@google/adk';
import type { Context } from '@google/adk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { z } from 'zod';
import { TimeService } from '../../../../../common/time/time.service';
import {
  SYSTEM_EVENT_CHANNEL,
  SystemEventType,
  type SystemNotificationEvent,
} from '../../../../../common/events/system-events.types';

@Injectable()
export class AppointmentToolsService {
  private readonly logger = new Logger('AppointmentTools');

  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly timeService: TimeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  get checkAvailabilityTool(): FunctionTool {
    return new FunctionTool({
      name: 'check_availability',
      description:
        'Consulta los horarios disponibles para agendar una cita. ' +
        'Acepta fechas en lenguaje natural (mañana, próximo lunes, etc.).',
      parameters: z.object({
        date: z
          .string()
          .describe(
            'Fecha para consultar (puede ser natural: "mañana", "próximo lunes")',
          ),
        serviceType: z
          .string()
          .optional()
          .describe('Tipo de servicio a agendar'),
        duration: z
          .number()
          .optional()
          .describe('Duración estimada en minutos'),
      }),
      execute: async (args, context?: Context) => {
        this.logger.debug(`Consultando disponibilidad para: ${args.date}`);

        const state = context?.state;
        const companyId = this.stateString(state?.get('app:companyId'));
        const userPhone = this.stateString(state?.get('user:phone'));

        this.emitToolTriggered(companyId, 'check_availability');

        try {
          if (!companyId) throw new Error('Empresa no identificada');
          const resolvedDate = this.timeService.resolveDateBounds(
            args.date,
            userPhone,
          );
          const available = await this.appointmentsService.availability({
            companyId,
            date: resolvedDate.date,
            durationMinutes: args.duration,
          });
          return {
            success: true,
            date: resolvedDate.date,
            available: available.map((slot) => ({
              start: slot.start,
              end: slot.end,
              staffId: slot.staffId,
              staffName: slot.staffName,
            })),
            message: available.length
              ? `Hay ${available.length} horario(s) disponible(s) el ${resolvedDate.date}.`
              : `No hay horarios disponibles el ${resolvedDate.date}.`,
          };
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Error checking availability: ${err.message}`);
          return {
            success: false,
            message:
              'No pude consultar la disponibilidad. Verifica que el calendario esté conectado.',
            error: err.message,
          };
        }
      },
    });
  }

  get createAppointmentTool(): FunctionTool {
    return new FunctionTool({
      name: 'create_appointment',
      description:
        'Agenda una nueva cita en el horario especificado. ' +
        'Requiere fecha, hora y duración; opcionalmente el tipo de servicio.',
      parameters: z.object({
        date: z.string().describe('Fecha de la cita'),
        time: z.string().describe('Hora de la cita (formato 24h, ej: "14:00")'),
        duration: z
          .string()
          .describe(
            'Duración obligatoria de la cita (ej: "1 hora", "15 minutos")',
          ),
        serviceType: z.string().optional().describe('Tipo de servicio'),
        notes: z.string().optional().describe('Notas adicionales'),
      }),
      execute: async (args, context?: Context) => {
        this.logger.debug(
          `Creando cita: ${args.date} ${args.time} (${args.duration})`,
        );

        const state = context?.state;
        const userPhone = this.stateString(state?.get('user:phone'));
        const userName = this.stateString(state?.get('user:name'));
        const companyId = this.stateString(state?.get('app:companyId'));

        this.emitToolTriggered(companyId, 'create_appointment');

        try {
          if (!companyId) throw new Error('Empresa no identificada');
          const durationMinutes = this.timeService.parseDurationToMinutes(
            args.duration,
          );
          const appointmentStart = this.timeService.buildAppointmentStart(
            args.date,
            args.time,
            userPhone,
          );

          const appointment = await this.appointmentsService.create(
            {
              companyId,
              customerPhone: userPhone,
              customerName: userName,
              title: `Cita con ${userName || userPhone || 'cliente'} - ${args.serviceType || 'General'}`,
              description: args.notes || '',
              start: appointmentStart.startIso,
              end: new Date(
                new Date(appointmentStart.startIso).getTime() +
                  durationMinutes * 60_000,
              ).toISOString(),
              appointmentType: 'service',
              contextType: 'service',
            },
            { kind: 'customer', companyId, phone: userPhone },
          );
          this.logger.debug(`Cita creada en DB: ${appointment.id}`);

          this.emitCompanyEvent(companyId, {
            type: SystemEventType.APPOINTMENT_CREATED,
            payload: {
              appointmentId: appointment.id,
              date: args.date,
              time: args.time,
              durationMinutes,
            },
          });

          return {
            success: true,
            appointmentId: appointment.id,
            link: appointment.google_calendar_link,
            syncStatus: appointment.sync_status,
            durationMinutes,
            timezone: appointmentStart.timezone,
            message: `Cita agendada correctamente.`,
          };
        } catch (error) {
          const err = error as Error;
          this.logger.error(`Error creating appointment: ${err.message}`);
          return {
            success: false,
            message: 'No pude agendar la cita. Inténtalo más tarde.',
            error: err.message,
          };
        }
      },
    });
  }

  get cancelAppointmentTool(): FunctionTool {
    return new FunctionTool({
      name: 'cancel_appointment',
      description:
        'Cancela una cita por su ID o identificándola por fecha y hora.',
      parameters: z.object({
        appointmentId: z
          .string()
          .optional()
          .describe('ID de la cita a cancelar'),
        date: z
          .string()
          .optional()
          .describe('Fecha de la cita si no se conoce su ID'),
        time: z
          .string()
          .optional()
          .describe('Hora de la cita si no se conoce su ID'),
        reason: z.string().optional().describe('Motivo de la cancelación'),
      }),
      execute: async (args, _context?: Context) => {
        const companyId = this.stateString(
          _context?.state?.get('app:companyId'),
        );
        this.emitToolTriggered(companyId, 'cancel_appointment');

        try {
          if (!companyId) throw new Error('Empresa no identificada');
          const phone = this.stateString(_context?.state?.get('user:phone'));
          if (!phone) throw new Error('Cliente no identificado');
          const target = args.appointmentId
            ? { id: args.appointmentId }
            : await this.appointmentsService.findForCustomer({
                companyId,
                phone,
                date: args.date,
                time: args.time,
              });
          const appointment = await this.appointmentsService.cancel(
            companyId,
            target.id,
            args.reason,
            { kind: 'customer', companyId, phone },
          );
          return {
            success: true,
            appointmentId: appointment.id,
            status: appointment.status,
            syncStatus: appointment.sync_status,
            message: `La cita ${appointment.id} ha sido cancelada. ¿Deseas reagendar?`,
          };
        } catch (error) {
          return { success: false, message: (error as Error).message };
        }
      },
    });
  }

  get rescheduleAppointmentTool(): FunctionTool {
    return new FunctionTool({
      name: 'reschedule_appointment',
      description:
        'Cambia la fecha y/o hora de una cita existente por ID o fecha/hora actual.',
      parameters: z.object({
        appointmentId: z
          .string()
          .optional()
          .describe('ID de la cita a reprogramar'),
        currentDate: z
          .string()
          .optional()
          .describe('Fecha actual si no se conoce el ID'),
        currentTime: z
          .string()
          .optional()
          .describe('Hora actual si no se conoce el ID'),
        newDate: z.string().describe('Nueva fecha'),
        newTime: z.string().describe('Nueva hora'),
      }),
      execute: async (args, _context?: Context) => {
        const companyId = this.stateString(
          _context?.state?.get('app:companyId'),
        );
        this.emitToolTriggered(companyId, 'reschedule_appointment');

        this.logger.debug(
          `Reprogramando cita ${args.appointmentId} a ${args.newDate} ${args.newTime}`,
        );

        try {
          if (!companyId) throw new Error('Empresa no identificada');
          const phone = this.stateString(_context?.state?.get('user:phone'));
          if (!phone) throw new Error('Cliente no identificado');
          const target = args.appointmentId
            ? { id: args.appointmentId }
            : await this.appointmentsService.findForCustomer({
                companyId,
                phone,
                date: args.currentDate,
                time: args.currentTime,
              });
          const start = this.timeService.buildAppointmentStart(
            args.newDate,
            args.newTime,
            phone,
          );
          const appointment =
            await this.appointmentsService.rescheduleKeepingDuration(
              companyId,
              target.id,
              start.startIso,
              { kind: 'customer', companyId, phone },
            );
          return {
            success: true,
            appointmentId: appointment.id,
            newDate: args.newDate,
            newTime: args.newTime,
            syncStatus: appointment.sync_status,
            message: `Cita ${appointment.id} reprogramada para ${args.newDate} a las ${args.newTime}.`,
          };
        } catch (error) {
          return { success: false, message: (error as Error).message };
        }
      },
    });
  }

  get listUserAppointmentsTool(): FunctionTool {
    return new FunctionTool({
      name: 'list_user_appointments',
      description: 'Lista todas las citas programadas del usuario actual.',
      parameters: z.object({
        status: z
          .enum(['all', 'upcoming', 'past', 'cancelled'])
          .optional()
          .describe('Filtrar por estado'),
        limit: z
          .number()
          .optional()
          .describe('Número máximo de citas a mostrar'),
      }),
      execute: async (args, context?: Context) => {
        const state = context?.state;
        const userPhone = this.stateString(state?.get('user:phone'));
        const companyId = this.stateString(state?.get('app:companyId'));

        this.emitToolTriggered(companyId, 'list_user_appointments');

        this.logger.debug(`Listando citas para usuario: ${userPhone}`);

        if (!companyId || !userPhone) {
          return { success: false, message: 'No pude identificar al usuario.' };
        }
        const appointments = await this.appointmentsService.listForCustomer(
          companyId,
          userPhone,
          args.status,
          args.limit,
        );
        return {
          success: true,
          appointments: appointments.map((appointment) => ({
            id: appointment.id,
            start: appointment.scheduled_start,
            end: appointment.scheduled_end,
            status: appointment.status,
            title: appointment.title,
          })),
          filter: args.status || 'upcoming',
          message: `Tienes ${appointments.length} cita(s).`,
        };
      },
    });
  }

  get adminTools(): FunctionTool[] {
    return [
      this.checkAvailabilityTool,
      this.createAppointmentTool,
      this.cancelAppointmentTool,
      this.rescheduleAppointmentTool,
      this.listUserAppointmentsTool,
    ];
  }

  get clientTools(): FunctionTool[] {
    return [
      this.checkAvailabilityTool,
      this.createAppointmentTool,
      this.cancelAppointmentTool,
      this.rescheduleAppointmentTool,
      this.listUserAppointmentsTool,
    ];
  }

  get allTools(): FunctionTool[] {
    return this.adminTools;
  }

  private emitToolTriggered(
    companyId: string | undefined,
    toolName: string,
  ): void {
    if (!companyId) {
      return;
    }

    this.emitCompanyEvent(companyId, {
      type: SystemEventType.TOOL_ACTION_TRIGGERED,
      payload: { toolName },
    });
  }

  private stateString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private emitCompanyEvent(
    companyId: string,
    params: {
      type: SystemEventType;
      payload: Record<string, unknown>;
    },
  ): void {
    const event: SystemNotificationEvent = {
      companyId,
      type: params.type,
      timestamp: new Date().toISOString(),
      payload: params.payload,
    };

    this.eventEmitter.emit(SYSTEM_EVENT_CHANNEL, event);
  }
}
