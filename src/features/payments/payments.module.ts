import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TransactionsController } from './transactions.controller';
import { PaymentIntegrationService } from './payment-integration.service';
import { PaymentWorkflowService } from './payment-workflow.service';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { SecurityModule } from '../../common/security/security.module';
import { WhatsappMessagingModule } from '../whatsapp/whatsapp-messaging.module';
import { PaybeSignerService } from './paybe-signer.service';

@Module({
  imports: [
    HttpModule,
    InfrastructureModule,
    SecurityModule,
    WhatsappMessagingModule,
  ],
  controllers: [TransactionsController],
  providers: [
    PaymentIntegrationService,
    PaymentWorkflowService,
    PaybeSignerService,
  ],
  exports: [PaymentWorkflowService],
})
export class PaymentsModule {}
