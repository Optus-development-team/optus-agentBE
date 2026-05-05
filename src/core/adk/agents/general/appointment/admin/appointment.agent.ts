import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmAgent } from '@google/adk';
import { AppointmentToolsService } from '../appointment.tools';
import { createGeminiAgent } from '../../../shared/adk-agent.factory';
import { AppointmentAdminSubAgentConfig } from '../../config/appointment.config';

/**
 * Agente de citas: gestiona reservas, cancelaciones y cambios de horario.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppointmentAdminAgent {
  private readonly logger = new Logger(AppointmentAdminAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: AppointmentToolsService,
  ) {
    const agentConfig = new AppointmentAdminSubAgentConfig();
    this.agent = createGeminiAgent(
      this.config,
      agentConfig.buildDefinition(this.tools.adminTools),
    );

    this.logger.log('Appointment Admin Agent inicializado');
  }
}
