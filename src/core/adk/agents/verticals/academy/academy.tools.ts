import { Injectable, Logger } from '@nestjs/common';
import { FunctionTool } from '@google/adk';
import { z } from 'zod';

@Injectable()
export class AcademyToolsService {
  private readonly logger = new Logger(AcademyToolsService.name);

  get queryGradesTool(): FunctionTool {
    return new FunctionTool({
      name: 'query_student_grades',
      description:
        'Consulta notas académicas del estudiante. TODO: integrar con servicio académico real.',
      parameters: z.object({
        studentId: z.string().describe('Identificador del estudiante'),
        period: z.string().optional().describe('Periodo académico'),
      }),
      execute: () => {
        this.logger.warn('query_student_grades pendiente de implementación');
        return {
          success: false,
          message: 'TODO: implementar query_student_grades',
        };
      },
    });
  }

  get checkEnrollmentsTool(): FunctionTool {
    return new FunctionTool({
      name: 'check_student_enrollments',
      description:
        'Consulta inscripciones y materias activas. TODO: integrar con servicio académico real.',
      parameters: z.object({
        studentId: z.string().describe('Identificador del estudiante'),
      }),
      execute: () => {
        this.logger.warn(
          'check_student_enrollments pendiente de implementación',
        );
        return {
          success: false,
          message: 'TODO: implementar check_student_enrollments',
        };
      },
    });
  }

  get allTools(): FunctionTool[] {
    return [this.queryGradesTool, this.checkEnrollmentsTool];
  }
}
