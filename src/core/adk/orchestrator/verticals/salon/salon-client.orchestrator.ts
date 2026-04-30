import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseSessionService } from '../../../session/supabase-session.service';
import { BaseOrchestratorService } from '../../base/orchestrator.base';
import { SalonClientOrchestratorConfig } from '../../config/salon-client.config';

@Injectable()
export class SalonClientOrchestratorService extends BaseOrchestratorService {
  constructor(
    config: ConfigService,
    sessionService: SupabaseSessionService,
    salonClientConfig: SalonClientOrchestratorConfig,
  ) {
    super(
      SalonClientOrchestratorService.name,
      config,
      sessionService,
      salonClientConfig,
    );
  }
}