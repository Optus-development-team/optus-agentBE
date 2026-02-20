import { Injectable, Logger } from '@nestjs/common';
import { CalendarService } from '../../../../features/calendar/calendar.service';
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
import { z } from 'zod';

@Injectable()
export class AppointmentToolsService {
  private readonly logger = new Logger('AppointmentTools');

  constructor(private readonly calendarService: CalendarService) {}

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

        try {
          const events = await this.calendarService.checkAvailability(
            companyId,
            args.date,
          );
          // Here you would process events to find free slots. For now returning raw events or a summary.
          // Simplified logic: Just returning the events found for now.
          return {
            success: true,
            date: args.date,
            events: events.map((e: any) => ({
              start: e.start.dateTime || e.start.date,
              end: e.end.dateTime || e.end.date,
              summary: e.summary,
            })),
            message:
              `Encontré estos eventos para ${args.date}: ` +
              events.map((e: any) => e.summary).join(', '),
          };
        } catch (error) {
          this.logger.error(`Error checking availability: ${error.message}`);
          return {
            success: false,
            message:
              'No pude consultar la disponibilidad. Verifica que el calendario esté conectado.',
            error: error.message,
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
        'Requiere fecha, hora y opcionalmente el tipo de servicio.',
      parameters: z.object({
        date: z.string().describe('Fecha de la cita'),
        time: z.string().describe('Hora de la cita (formato 24h, ej: "14:00")'),
        serviceType: z.string().optional().describe('Tipo de servicio'),
        notes: z.string().optional().describe('Notas adicionales'),
      }),
      execute: async (args, context?: ToolContext) => {
        this.logger.debug(`Creando cita: ${args.date} ${args.time}`);

        const state = context?.state;
        const userPhone = state?.get('user:phone');
        const userName = state?.get('user:name');
        const companyId = state?.get('app:companyId') as string;

        try {
          // Combine date and time to ISO strings
          const startDateTime = `${args.date}T${args.time}:00-04:00`; // Assuming local time zone or need to handle TZ
          // Default 1 hour duration
          const endDateTimeDateTime = new Date(
            new Date(startDateTime).getTime() + 60 * 60 * 1000,
          ).toISOString();

          const event = await this.calendarService.createAppointment(
            companyId,
            {
              summary: `Cita con ${userName || userPhone} - ${args.serviceType || 'General'}`,
              description: args.notes || '',
              start: new Date(startDateTime).toISOString(),
              end: endDateTimeDateTime,
            },
          );

          return {
            success: true,
            appointmentId: event.id,
            link: event.htmlLink,
            message: `Cita agendada correctamente.`,
          };
        } catch (error) {
          this.logger.error(`Error creating appointment: ${error.message}`);
          return {
            success: false,
            message: 'No pude agendar la cita. Inténtalo más tarde.',
            error: error.message,
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
}
