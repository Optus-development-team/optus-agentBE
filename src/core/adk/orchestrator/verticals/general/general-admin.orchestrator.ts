import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseSessionService } from '../../../session/supabase-session.service';
import { BaseOrchestratorService } from '../../base/orchestrator.base';
import { GeneralAdminOrchestratorConfig } from '../../config/general-admin.config';

@Injectable()
export class GeneralAdminOrchestratorService extends BaseOrchestratorService {
  constructor(
    config: ConfigService,
    sessionService: SupabaseSessionService,
    generalAdminConfig: GeneralAdminOrchestratorConfig,
  ) {
    super(
      GeneralAdminOrchestratorService.name,
      config,
      sessionService,
      generalAdminConfig,
    );
  }
}
