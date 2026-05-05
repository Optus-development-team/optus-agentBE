import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmAgent } from '@google/adk';
import { SalonToolsService } from './salon.tools';
import { createGeminiAgent } from '../../shared/adk-agent.factory';
import { SalonSubAgentConfig } from '../config/verticals.config';

@Injectable({ scope: Scope.TRANSIENT })
export class SalonStylistAgent {
  private readonly logger = new Logger(SalonStylistAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: SalonToolsService,
  ) {
    const agentConfig = new SalonSubAgentConfig();
    this.agent = createGeminiAgent(
      this.config,
      agentConfig.buildDefinition(this.tools.allTools),
    );

    this.logger.log('Salon Stylist Agent inicializado');
  }
}
