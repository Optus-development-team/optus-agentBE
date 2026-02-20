import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { OAuthService } from '../auth/oauth.service';
import { CalendarController } from './calendar.controller';
import { SecurityModule } from '../../common/security/security.module';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';

@Module({
  imports: [SecurityModule, InfrastructureModule],
  controllers: [CalendarController],
  providers: [CalendarService, OAuthService],
  exports: [CalendarService, OAuthService],
})
export class CalendarModule {}
