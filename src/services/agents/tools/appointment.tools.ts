/**
 * Herramientas (tools) para el agente de citas.
 * Estas tools permiten gestionar reservas, disponibilidad y calendario.
 *
 * @see https://google.github.io/adk-docs/tools-custom/function-tools/
 */
import { FunctionTool } from '@google/adk';
import type { ToolContext } from '@google/adk';
import { z } from 'zod';
import { Logger } from '@nestjs/common';

const logger = new Logger('AppointmentTools');

/**
 * Tool: Consultar disponibilidad
 */
export const checkAvailabilityTool = new FunctionTool({
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
    serviceType: z.string().optional().describe('Tipo de servicio a agendar'),
    duration: z.number().optional().describe('Duración estimada en minutos'),
  }),
  execute: async (args, context?: ToolContext) => {
    logger.debug(`Consultando disponibilidad para: ${args.date}`);

    const state = context?.state;
    const companyId = state?.get('app:companyId') as string | undefined;

    // TODO: Implementar con Google Calendar API
    return {
      success: true,
      date: args.date,
      availableSlots: [
        { time: '09:00', duration: 60, available: true },
        { time: '10:00', duration: 60, available: true },
        { time: '11:00', duration: 60, available: false },
        { time: '14:00', duration: 60, available: true },
        { time: '15:00', duration: 60, available: true },
      ],
      companyId,
      message: `Horarios disponibles para ${args.date}: 9:00, 10:00, 14:00, 15:00`,
    };
  },
});

/**
 * Tool: Crear cita
 */
export const createAppointmentTool = new FunctionTool({
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
    logger.debug(`Creando cita: ${args.date} ${args.time}`);

    const state = context?.state;
    const userPhone = state?.get('user:phone') as string | undefined;
    const userName = state?.get('user:name') as string | undefined;

    // Generar ID único de cita
    const appointmentId = `APT-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // TODO: Implementar con Google Calendar API
    return {
      success: true,
      appointmentId,
      date: args.date,
      time: args.time,
      serviceType: args.serviceType || 'General',
      clientPhone: userPhone,
      clientName: userName,
      status: 'confirmed',
      message: `Cita ${appointmentId} agendada para ${args.date} a las ${args.time}. Te enviaremos un recordatorio.`,
    };
  },
});

/**
 * Tool: Cancelar cita
 */
export const cancelAppointmentTool = new FunctionTool({
  name: 'cancel_appointment',
  description: 'Cancela una cita existente por su ID.',
  parameters: z.object({
    appointmentId: z.string().describe('ID de la cita a cancelar'),
    reason: z.string().optional().describe('Motivo de la cancelación'),
  }),
  execute: async (args, _context?: ToolContext) => {
    logger.debug(`Cancelando cita: ${args.appointmentId}`);

    // TODO: Implementar con Google Calendar API
    return {
      success: true,
      appointmentId: args.appointmentId,
      status: 'cancelled',
      reason: args.reason || 'Cancelada por el usuario',
      message: `La cita ${args.appointmentId} ha sido cancelada. ¿Deseas reagendar?`,
    };
  },
});

/**
 * Tool: Reprogramar cita
 */
export const rescheduleAppointmentTool = new FunctionTool({
  name: 'reschedule_appointment',
  description: 'Cambia la fecha y/o hora de una cita existente.',
  parameters: z.object({
    appointmentId: z.string().describe('ID de la cita a reprogramar'),
    newDate: z.string().describe('Nueva fecha'),
    newTime: z.string().describe('Nueva hora'),
  }),
  execute: async (args, _context?: ToolContext) => {
    logger.debug(
      `Reprogramando cita ${args.appointmentId} a ${args.newDate} ${args.newTime}`,
    );

    // TODO: Implementar con Google Calendar API
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

/**
 * Tool: Listar citas del usuario
 */
export const listUserAppointmentsTool = new FunctionTool({
  name: 'list_user_appointments',
  description: 'Lista todas las citas programadas del usuario actual.',
  parameters: z.object({
    status: z
      .enum(['all', 'upcoming', 'past', 'cancelled'])
      .optional()
      .describe('Filtrar por estado'),
    limit: z.number().optional().describe('Número máximo de citas a mostrar'),
  }),
  execute: async (args, context?: ToolContext) => {
    const state = context?.state;
    const userPhone = state?.get('user:phone') as string | undefined;

    logger.debug(`Listando citas para usuario: ${userPhone}`);

    // TODO: Implementar consulta real
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

/**
 * Array de todas las tools de citas para el agente
 */
export const appointmentTools = [
  checkAvailabilityTool,
  createAppointmentTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  listUserAppointmentsTool,
];
