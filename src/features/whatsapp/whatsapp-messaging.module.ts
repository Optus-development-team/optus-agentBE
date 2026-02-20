import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppMessagingService } from './services/whatsapp.messaging.service';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [WhatsAppMessagingService],
  exports: [WhatsAppMessagingService],
})
export class WhatsappMessagingModule {}
