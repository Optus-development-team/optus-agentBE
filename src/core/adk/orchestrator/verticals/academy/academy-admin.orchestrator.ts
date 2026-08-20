import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseSessionService } from '../../../session/supabase-session.service';
import { BaseOrchestratorService } from '../../base/orchestrator.base';
import { AcademyAdminOrchestratorConfig } from '../../config/academy-admin.config';

@Injectable()
export class AcademyAdminOrchestratorService extends BaseOrchestratorService {
  constructor(
    config: ConfigService,
    sessionService: SupabaseSessionService,
    academyAdminConfig: AcademyAdminOrchestratorConfig,
  ) {
    super(
      AcademyAdminOrchestratorService.name,
      config,
      sessionService,
      academyAdminConfig,
    );
  }
}
