import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { OAuthService } from '../auth/oauth.service';
import { SecurityModule } from '../../common/security/security.module';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { TimeModule } from '../../common/time/time.module';

@Module({
  imports: [SecurityModule, InfrastructureModule, TimeModule],
  providers: [CalendarService, OAuthService],
  exports: [CalendarService, OAuthService],
})
export class CalendarModule {}
