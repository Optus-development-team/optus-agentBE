import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TimeService } from './time.service';

@Module({
  imports: [ConfigModule],
  providers: [TimeService],
  exports: [TimeService],
})
export class TimeModule {}
