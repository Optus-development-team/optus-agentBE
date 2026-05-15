import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TransactionsController } from './transactions.controller';
import { PaymentIntegrationService } from './payment-integration.service';
import { PaymentWorkflowService } from './payment-workflow.service';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { SecurityModule } from '../../common/security/security.module';
import { X402DynamicMiddleware } from '../../common/security/x402/x402.middleware';
import { WhatsappMessagingModule } from '../messaging/features/whatsapp/whatsapp-messaging.module';

@Module({
  imports: [
    HttpModule,
    InfrastructureModule,
    SecurityModule,
    WhatsappMessagingModule,
  ],
  controllers: [TransactionsController],
  providers: [PaymentIntegrationService, PaymentWorkflowService, X402DynamicMiddleware],
  exports: [PaymentWorkflowService],
})
export class PaymentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(X402DynamicMiddleware)
      .forRoutes({ path: 'tx/item/:itemId', method: RequestMethod.POST });
  }
}
