import { Injectable, Logger } from '@nestjs/common';
import type { RouterMessageContext } from '../../../features/whatsapp/types/whatsapp.types';
import { UserRole } from '../../../features/whatsapp/types/whatsapp.types';
import type { OrchestrationResult } from './orchestrator.types';
import { ClientOrchestratorService } from './client_orchestrator/client-orchestrator.service';
import { CompanyOrchestratorService } from './company_orchestrator/company-orchestrator.service';

@Injectable()
export class AdkOrchestratorService {
  private readonly logger = new Logger(AdkOrchestratorService.name);

  constructor(
    private readonly clientOrchestrator: ClientOrchestratorService,
    private readonly companyOrchestrator: CompanyOrchestratorService,
  ) {}

  async route(context: RouterMessageContext): Promise<OrchestrationResult> {
    const role = context.role ?? UserRole.CLIENT;
    const orchestrator =
      role === UserRole.ADMIN
        ? this.companyOrchestrator
        : this.clientOrchestrator;

    this.logger.debug(
      `Derivando mensaje de ${context.senderId} a ${role === UserRole.ADMIN ? 'company' : 'client'} orchestrator`,
    );

    return orchestrator.route(context);
  }
}
