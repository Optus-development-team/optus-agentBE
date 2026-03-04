import { Injectable, Logger } from '@nestjs/common';
import { CalendarService } from '../../../../../features/calendar/calendar.service';
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
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
    private readonly calendarService: CalendarService,
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
      execute: async (args, context?: ToolContext) => {
        this.logger.debug(`Consultando disponibilidad para: ${args.date}`);

        const state = context?.state;
        const companyId = state?.get('app:companyId') as string;
        const userPhone = state?.get('user:phone') as string | undefined;

        this.emitToolTriggered(companyId, 'check_availability');

        try {
          const resolvedDate = this.timeService.resolveDateBounds(
            args.date,
            userPhone,
          );
          const events = await this.calendarService.checkAvailability(
            companyId,
            resolvedDate.date,
            userPhone,
          );
          // Here you would process events to find free slots. For now returning raw events or a summary.
          // Simplified logic: Just returning the events found for now.
          return {
            success: true,
            date: resolvedDate.date,
            events: events.map((e: any) => ({
              start: e.start.dateTime || e.start.date,
              end: e.end.dateTime || e.end.date,
              summary: e.summary,
            })),
            message:
              `Encontré estos eventos para ${resolvedDate.date}: ` +
              events.map((e: any) => e.summary).join(', '),
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
          .describe('Duración obligatoria de la cita (ej: "1 hora", "15 minutos")'),
        serviceType: z.string().optional().describe('Tipo de servicio'),
        notes: z.string().optional().describe('Notas adicionales'),
      }),
      execute: async (args, context?: ToolContext) => {
        this.logger.debug(`Creando cita: ${args.date} ${args.time} (${args.duration})`);

        const state = context?.state;
        const userPhone = state?.get('user:phone');
        const userName = state?.get('user:name');
        const companyId = state?.get('app:companyId') as string;

        this.emitToolTriggered(companyId, 'create_appointment');

        try {
          const durationMinutes = this.timeService.parseDurationToMinutes(
            args.duration,
          );
          const appointmentStart = this.timeService.buildAppointmentStart(
            args.date,
            args.time,
            userPhone as string | undefined,
          );

          const event = await this.calendarService.createAppointment(
            companyId,
            {
              summary: `Cita con ${userName || userPhone} - ${args.serviceType || 'General'}`,
              description: args.notes || '',
              start: appointmentStart.startIso,
              durationMinutes,
            },
            userPhone as string | undefined,
          );

          this.emitCompanyEvent(companyId, {
            type: SystemEventType.APPOINTMENT_CREATED,
            payload: {
              appointmentId: event.id,
              date: args.date,
              time: args.time,
              durationMinutes,
            },
          });

          return {
            success: true,
            appointmentId: event.id,
            link: event.calendarAppLink || event.htmlLink,
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
      description: 'Cancela una cita existente por su ID.',
      parameters: z.object({
        appointmentId: z.string().describe('ID de la cita a cancelar'),
        reason: z.string().optional().describe('Motivo de la cancelación'),
      }),
      execute: (args, _context?: ToolContext) => {
        const companyId = _context?.state?.get('app:companyId') as
          | string
          | undefined;
        this.emitToolTriggered(companyId, 'cancel_appointment');

        this.logger.debug(`Cancelando cita: ${args.appointmentId}`);

        return {
          success: true,
          appointmentId: args.appointmentId,
          status: 'cancelled',
          reason: args.reason || 'Cancelada por el usuario',
          message: `La cita ${args.appointmentId} ha sido cancelada. ¿Deseas reagendar?`,
        };
      },
    });
  }

  get rescheduleAppointmentTool(): FunctionTool {
    return new FunctionTool({
      name: 'reschedule_appointment',
      description: 'Cambia la fecha y/o hora de una cita existente.',
      parameters: z.object({
        appointmentId: z.string().describe('ID de la cita a reprogramar'),
        newDate: z.string().describe('Nueva fecha'),
        newTime: z.string().describe('Nueva hora'),
      }),
      execute: (args, _context?: ToolContext) => {
        const companyId = _context?.state?.get('app:companyId') as
          | string
          | undefined;
        this.emitToolTriggered(companyId, 'reschedule_appointment');

        this.logger.debug(
          `Reprogramando cita ${args.appointmentId} a ${args.newDate} ${args.newTime}`,
        );

        return {
          success: true,
          appointmentId: args.appointmentId,
          previousDate: '2024-01-15',
          previousTime: '10:00',
          newDate: args.newDate,
          newTime: args.newTime,
          status: 'rescheduled',
          message: `Cita ${args.appointmentId} reprogramada para ${args.newDate} a las ${args.newTime}.`,
        };
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
      execute: (args, context?: ToolContext) => {
        const state = context?.state;
        const userPhone = state?.get('user:phone') as string | undefined;
        const companyId = state?.get('app:companyId') as string | undefined;

        this.emitToolTriggered(companyId, 'list_user_appointments');

        this.logger.debug(`Listando citas para usuario: ${userPhone}`);

        return {
          success: true,
          appointments: [
            {
              id: 'APT-001',
              date: '2024-01-20',
              time: '10:00',
              status: 'confirmed',
              serviceType: 'Consulta general',
            },
            {
              id: 'APT-002',
              date: '2024-01-25',
              time: '15:00',
              status: 'confirmed',
              serviceType: 'Seguimiento',
            },
          ],
          filter: args.status || 'upcoming',
          message: 'Tienes 2 citas programadas próximamente.',
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
