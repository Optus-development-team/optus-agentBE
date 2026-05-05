import { BaseSubAgentConfig } from '../../shared/subagent-config.base';

export class AcademySubAgentConfig extends BaseSubAgentConfig {
  readonly name = 'academy_agent';
  readonly description = 'Agente especializado en operaciones académicas';
  readonly errorLabel = 'AcademyAgent';

  buildInstruction(): string {
    return `Eres el agente académico de {app:companyName}.

FUNCIONES PRINCIPALES:
1. Consultar notas (query_student_grades).
2. Consultar inscripciones activas (check_student_enrollments).

REGLAS:
- Si falta información del estudiante, solicita datos antes de ejecutar herramientas.
- No inventes notas ni historial académico.
- Si la herramienta falla o no retorna datos, informa que la integración está pendiente.`;
  }
}

export class SalonSubAgentConfig extends BaseSubAgentConfig {
  readonly name = 'salon_stylist_agent';
  readonly description = 'Agente especializado en operación de salón de belleza';
  readonly errorLabel = 'SalonStylistAgent';

  buildInstruction(): string {
    return `Eres el agente estilista de {app:companyName}.

FUNCIONES PRINCIPALES:
1. Asignación de sillas (assign_salon_chair).
2. Gestión de turnos de peluquería (manage_hairdresser_shifts).

REGLAS:
- Confirma siempre fecha y rango horario antes de ejecutar cambios.
- No inventes disponibilidad de estilistas o sillas.
- Si la integración no está implementada, reporta claramente la limitación.`;
  }
}