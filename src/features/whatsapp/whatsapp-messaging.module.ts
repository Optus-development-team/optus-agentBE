import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { WhatsAppMessagingService } from './services/whatsapp.messaging.service';
import { CompanyStickerService } from './services/company-sticker.service';
import { WhatsAppResponseService } from './services/whatsapp-response.service';

@Module({
  imports: [ConfigModule, HttpModule, InfrastructureModule],
  providers: [WhatsAppMessagingService, CompanyStickerService, WhatsAppResponseService],
  exports: [WhatsAppMessagingService, CompanyStickerService, WhatsAppResponseService],
})
export class WhatsappMessagingModule {}
