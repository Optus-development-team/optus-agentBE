import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseSessionService } from '../../../session/supabase-session.service';
import { BaseOrchestratorService } from '../../base/orchestrator.base';
import { AcademyClientOrchestratorConfig } from '../../config/academy-client.config';

@Injectable()
export class AcademyClientOrchestratorService extends BaseOrchestratorService {
  constructor(
    config: ConfigService,
    sessionService: SupabaseSessionService,
    academyClientConfig: AcademyClientOrchestratorConfig,
  ) {
    super(
      AcademyClientOrchestratorService.name,
      config,
      sessionService,
      academyClientConfig,
    );
  }
}
