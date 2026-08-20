import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseSessionService } from '../../../session/supabase-session.service';
import { BaseOrchestratorService } from '../../base/orchestrator.base';
import { SalonAdminOrchestratorConfig } from '../../config/salon-admin.config';

@Injectable()
export class SalonAdminOrchestratorService extends BaseOrchestratorService {
  constructor(
    config: ConfigService,
    sessionService: SupabaseSessionService,
    salonAdminConfig: SalonAdminOrchestratorConfig,
  ) {
    super(
      SalonAdminOrchestratorService.name,
      config,
      sessionService,
      salonAdminConfig,
    );
  }
}
