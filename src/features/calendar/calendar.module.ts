import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../../common/security/security.module';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { TimeModule } from '../../common/time/time.module';

@Module({
  imports: [AuthModule, SecurityModule, InfrastructureModule, TimeModule],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
