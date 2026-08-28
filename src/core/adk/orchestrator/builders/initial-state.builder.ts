import type { ConfigService } from '@nestjs/config';
import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { UserRole } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { TimeService } from '../../../../common/time/time.service';
import { flattenCompanyConfig } from '../../session/config-flattener';

export interface InitialStateBuilderOptions {
  defaultRole: UserRole;
  extraState?: Record<string, unknown>;
}

export function buildInitialState(
  context: RouterMessageContext,
  config: ConfigService,
  timeService: TimeService,
  options: InitialStateBuilderOptions,
): Record<string, unknown> {
  const companyId = context.tenant?.companyId;
  const companyName = context.tenant?.companyName ?? '';
  const userPhone = context.senderId;
  const timezone = timeService.getTimezone(userPhone);
  const role = context.role ?? options.defaultRole;

  // Aplanar y filtrar el config de la empresa por rol
  const rawConfig = context.tenant?.companyConfig ?? {};
  const flatConfig = flattenCompanyConfig(rawConfig, role);

  return {
    'user:phone': userPhone,
    'user:role': role,
    'user:name': context.senderName,
    'app:companyId': companyId ?? undefined,
    'app:companyName': companyName,
    'app:currency': config.get<string>('DEFAULT_CURRENCY', 'USD') ?? 'USD',
    'app:phoneNumberId':
      context.tenant?.phoneNumberId ?? context.phoneNumberId ?? undefined,
    'app:displayPhoneNumber': context.tenant?.displayPhoneNumber ?? undefined,
    'app:todayDate': timeService.getTodayDate(userPhone),
    'app:currentDateTime': timeService.getCurrentDateTime(userPhone),
    'app:timezone': timezone,
    'app:configVersion': context.tenant?.configUpdatedAt ?? new Date().toISOString(),
    // Claves aplanadas del config (agent:tone, agent:name, agent:caps, etc.)
    ...flatConfig,
    ...(options.extraState ?? {}),
  };
}
