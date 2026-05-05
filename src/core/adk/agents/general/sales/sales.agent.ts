import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmAgent } from '@google/adk';
import { SalesToolsService } from './sales.tools';
import { createGeminiAgent } from '../../shared/adk-agent.factory';
import { SalesSubAgentConfig } from '../config/sales.config';

@Injectable({ scope: Scope.TRANSIENT })
export class SalesAgent {
  private readonly logger = new Logger(SalesAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: SalesToolsService,
  ) {
    const agentConfig = new SalesSubAgentConfig();
    this.agent = createGeminiAgent(
      this.config,
      agentConfig.buildDefinition(this.tools.allTools),
    );

    this.logger.log('Sales Agent inicializado');
  }
}
