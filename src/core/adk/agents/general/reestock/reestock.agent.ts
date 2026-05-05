import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmAgent } from '@google/adk';
import { ReestockToolsService } from './reestock.tools';
import { createGeminiAgent } from '../../shared/adk-agent.factory';
import { ReestockSubAgentConfig } from '../config/reestock.config';

@Injectable({ scope: Scope.TRANSIENT })
export class ReestockAgent {
  private readonly logger = new Logger(ReestockAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: ReestockToolsService,
  ) {
    const agentConfig = new ReestockSubAgentConfig();
    this.agent = createGeminiAgent(
      this.config,
      agentConfig.buildDefinition(this.tools.allTools),
    );

    this.logger.log('Reestock Agent inicializado');
  }
}
