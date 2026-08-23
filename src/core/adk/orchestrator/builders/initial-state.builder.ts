import type { ConfigService } from '@nestjs/config';
import type { RouterMessageContext } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { UserRole } from '../../../../features/messaging/features/whatsapp/types/whatsapp.types';
import type { TimeService } from '../../../../common/time/time.service';

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

  return {
    'user:phone': userPhone,
    'user:role': context.role ?? options.defaultRole,
    'user:name': context.senderName,
    'app:companyId': companyId ?? undefined,
    'app:companyName': companyName,
    'app:companyConfig': context.tenant?.companyConfig ?? {},
    'app:currency': config.get<string>('DEFAULT_CURRENCY', 'USD') ?? 'USD',
    'app:companyTone': 'profesional',
    'app:phoneNumberId':
      context.tenant?.phoneNumberId ?? context.phoneNumberId ?? undefined,
    'app:displayPhoneNumber': context.tenant?.displayPhoneNumber ?? undefined,
    'app:todayDate': timeService.getTodayDate(userPhone),
    'app:currentDateTime': timeService.getCurrentDateTime(userPhone),
    'app:timezone': timezone,
    ...(options.extraState ?? {}),
  };
}
