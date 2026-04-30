import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseSessionService } from '../../../session/supabase-session.service';
import { BaseOrchestratorService } from '../../base/orchestrator.base';
import { GeneralClientOrchestratorConfig } from '../../config/general-client.config';

@Injectable()
export class GeneralClientOrchestratorService extends BaseOrchestratorService {
  constructor(
    config: ConfigService,
    sessionService: SupabaseSessionService,
    generalClientConfig: GeneralClientOrchestratorConfig,
  ) {
    super(
      GeneralClientOrchestratorService.name,
      config,
      sessionService,
      generalClientConfig,
    );
  }
}
