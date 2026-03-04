import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RouterMessageContext } from '../../../features/whatsapp/types/whatsapp.types';
import type { CompanyVertical } from '../../../features/whatsapp/types/whatsapp.types';
import { UserRole } from '../../../features/whatsapp/types/whatsapp.types';
import type { OrchestrationResult } from './orchestrator.types';
import { GeneralClientOrchestratorService } from './verticals/general/general-client.orchestrator';
import { GeneralAdminOrchestratorService } from './verticals/general/general-admin.orchestrator';
import { AcademyClientOrchestratorService } from './verticals/academy/academy-client.orchestrator';
import { AcademyAdminOrchestratorService } from './verticals/academy/academy-admin.orchestrator';
import { SalonClientOrchestratorService } from './verticals/salon/salon-client.orchestrator';
import { SalonAdminOrchestratorService } from './verticals/salon/salon-admin.orchestrator';
import {
  SYSTEM_EVENT_CHANNEL,
  SystemEventType,
  type SystemNotificationEvent,
} from '../../../common/events/system-events.types';

@Injectable()
export class AdkOrchestratorService {
  private readonly logger = new Logger(AdkOrchestratorService.name);

  constructor(
    private readonly generalClientOrchestrator: GeneralClientOrchestratorService,
    private readonly generalAdminOrchestrator: GeneralAdminOrchestratorService,
    private readonly academyClientOrchestrator: AcademyClientOrchestratorService,
    private readonly academyAdminOrchestrator: AcademyAdminOrchestratorService,
    private readonly salonClientOrchestrator: SalonClientOrchestratorService,
    private readonly salonAdminOrchestrator: SalonAdminOrchestratorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async route(context: RouterMessageContext): Promise<OrchestrationResult> {
    const role = context.role ?? UserRole.CLIENT;
    const vertical = this.normalizeVertical(context.tenant.vertical);
    const orchestrator = this.resolveOrchestrator(role, vertical);
    const companyId = context.tenant?.companyId;

    if (companyId) {
      this.emitCompanyEvent(companyId, {
        type: SystemEventType.TENANT_RESOLVED,
        payload: {
          senderId: context.senderId,
          phoneNumberId: context.phoneNumberId,
          vertical,
          role,
        },
      });
    }

    this.logger.debug(
      `Derivando mensaje de ${context.senderId} a ${vertical}/${role} orchestrator`,
    );

    const result = await orchestrator.route(context);

    if (companyId) {
      this.emitCompanyEvent(companyId, {
        type: SystemEventType.LLM_RESPONSE_GENERATED,
        payload: {
          intent: result.intent,
          agentUsed: result.agentUsed,
          responseLength: result.responseText?.length ?? 0,
        },
      });
    }

    return result;
  }

  private emitCompanyEvent(
    companyId: string,
    params: {
      type: SystemEventType;
      payload: Record<string, unknown>;
    },
  ): void {
    const event: SystemNotificationEvent = {
      companyId,
      type: params.type,
      timestamp: new Date().toISOString(),
      payload: params.payload,
    };

    this.eventEmitter.emit(SYSTEM_EVENT_CHANNEL, event);
  }

  private resolveOrchestrator(role: UserRole, vertical: CompanyVertical) {
    if (vertical === 'academy') {
      return role === UserRole.ADMIN
        ? this.academyAdminOrchestrator
        : this.academyClientOrchestrator;
    }

    if (vertical === 'salon') {
      return role === UserRole.ADMIN
        ? this.salonAdminOrchestrator
        : this.salonClientOrchestrator;
    }

    return role === UserRole.ADMIN
      ? this.generalAdminOrchestrator
      : this.generalClientOrchestrator;
  }

  private normalizeVertical(value: string | undefined): CompanyVertical {
    if (value === 'academy' || value === 'salon') {
      return value;
    }

    return 'general';
  }
}
