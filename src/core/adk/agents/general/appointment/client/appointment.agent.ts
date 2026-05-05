import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmAgent } from '@google/adk';
import { AppointmentToolsService } from '../appointment.tools';
import { createGeminiAgent } from '../../../shared/adk-agent.factory';
import { AppointmentClientSubAgentConfig } from '../../config/appointment.config';

/**
 * Agente de citas: gestiona reservas, cancelaciones y cambios de horario.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppointmentClientAgent {
  private readonly logger = new Logger(AppointmentClientAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: AppointmentToolsService,
  ) {
    const agentConfig = new AppointmentClientSubAgentConfig();
    this.agent = createGeminiAgent(
      this.config,
      agentConfig.buildDefinition(this.tools.clientTools),
    );

    this.logger.log('Appointment Client Agent inicializado');
  }
}
