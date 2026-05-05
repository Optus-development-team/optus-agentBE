import { Injectable, Logger, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmAgent } from '@google/adk';
import { KnowledgeBaseToolsService } from './knowledge.tools';
import { createGeminiAgent } from '../../shared/adk-agent.factory';
import { KnowledgeSubAgentConfig } from '../config/knowledge.config';

@Injectable({ scope: Scope.TRANSIENT })
export class KnowledgeAgent {
  private readonly logger = new Logger(KnowledgeAgent.name);
  readonly agent: LlmAgent;

  constructor(
    private readonly config: ConfigService,
    private readonly tools: KnowledgeBaseToolsService,
  ) {
    const agentConfig = new KnowledgeSubAgentConfig();
    this.agent = createGeminiAgent(
      this.config,
      agentConfig.buildDefinition(this.tools.tools),
    );

    this.logger.log('Knowledge Agent inicializado');
  }
}
