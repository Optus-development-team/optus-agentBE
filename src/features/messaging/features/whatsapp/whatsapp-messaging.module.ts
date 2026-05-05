import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { InfrastructureModule } from '../../../../common/intraestructure/infrastructure.module';
import { WhatsAppMessagingService } from './services/whatsapp.messaging.service';

@Module({
  imports: [ConfigModule, HttpModule, InfrastructureModule],
  providers: [WhatsAppMessagingService],
  exports: [WhatsAppMessagingService],
})
export class WhatsappMessagingModule {}
