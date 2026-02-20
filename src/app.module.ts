import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InfrastructureModule } from './common/intraestructure/infrastructure.module';
import { SecurityModule } from './common/security/security.module';
import { AuthModule } from './features/auth/auth.module';
import { CompanyModule } from './features/company/company.module';
import { LoginModule } from './features/login/login.module';
import { PaymentsModule } from './features/payments/payments.module';
import { WhatsappModule } from './features/whatsapp/whatsapp.module';
import { WebhooksModule } from './features/webhooks/webhooks.module';
import { AdkModule } from './core/adk/adk.module';

import { CalendarModule } from './features/calendar/calendar.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    InfrastructureModule,
    SecurityModule,
    LoginModule,
    AuthModule,
    CompanyModule,
    PaymentsModule,
    AdkModule,
    WhatsappModule,
    WebhooksModule,
    CalendarModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
