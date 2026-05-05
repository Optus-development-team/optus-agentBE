import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmAgent } from '@google/adk';
import { ReportingToolsService } from './reporting.tools';
import { createGeminiAgent } from '../../shared/adk-agent.factory';
import { ReportingSubAgentConfig } from '../config/reporting.config';

@Injectable({ scope: Scope.TRANSIENT })
export class ReportingAgent {
  private readonly logger = new Logger(ReportingAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: ReportingToolsService,
  ) {
    const agentConfig = new ReportingSubAgentConfig();
    this.agent = createGeminiAgent(
      this.config,
      agentConfig.buildDefinition(this.tools.allTools),
    );

    this.logger.log('Reporting Agent inicializado');
  }
}
