import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmAgent } from '@google/adk';
import { AcademyToolsService } from './academy.tools';
import { createGeminiAgent } from '../../shared/adk-agent.factory';
import { AcademySubAgentConfig } from '../config/verticals.config';

@Injectable({ scope: Scope.TRANSIENT })
export class AcademyAgent {
  private readonly logger = new Logger(AcademyAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: AcademyToolsService,
  ) {
    const agentConfig = new AcademySubAgentConfig();
    this.agent = createGeminiAgent(
      this.config,
      agentConfig.buildDefinition(this.tools.allTools),
    );

    this.logger.log('Academy Agent inicializado');
  }
}
