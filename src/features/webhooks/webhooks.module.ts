import { Module } from '@nestjs/common';
import { ExternalWebhooksController } from './webhooks.controller';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';

@Module({
  imports: [InfrastructureModule],
  controllers: [ExternalWebhooksController],
})
export class WebhooksModule {}
