import { Injectable, Logger } from '@nestjs/common';
import { FunctionTool } from '@google/adk';
import { z } from 'zod';

@Injectable()
export class SalonToolsService {
  private readonly logger = new Logger(SalonToolsService.name);

  get assignChairTool(): FunctionTool {
    return new FunctionTool({
      name: 'assign_salon_chair',
      description:
        'Asigna una silla a un estilista/turno. TODO: integrar con operación real de salón.',
      parameters: z.object({
        stylistId: z.string().describe('Identificador del estilista'),
        chairId: z.string().describe('Identificador de la silla'),
        shiftDate: z.string().describe('Fecha del turno'),
      }),
      execute: () => {
        this.logger.warn('assign_salon_chair pendiente de implementación');
        return {
          success: false,
          message: 'TODO: implementar assign_salon_chair',
        };
      },
    });
  }

  get manageHairShiftsTool(): FunctionTool {
    return new FunctionTool({
      name: 'manage_hairdresser_shifts',
      description:
        'Gestiona turnos de peluquería. TODO: integrar con operación real de turnos.',
      parameters: z.object({
        stylistId: z.string().describe('Identificador del estilista'),
        action: z
          .enum(['create', 'update', 'cancel'])
          .describe('Acción a ejecutar'),
        shiftDate: z.string().describe('Fecha del turno'),
        startTime: z.string().optional().describe('Hora de inicio (24h)'),
        endTime: z.string().optional().describe('Hora de fin (24h)'),
      }),
      execute: () => {
        this.logger.warn(
          'manage_hairdresser_shifts pendiente de implementación',
        );
        return {
          success: false,
          message: 'TODO: implementar manage_hairdresser_shifts',
        };
      },
    });
  }

  get allTools(): FunctionTool[] {
    return [this.assignChairTool, this.manageHairShiftsTool];
  }
}
