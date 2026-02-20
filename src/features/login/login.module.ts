import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { VerificationService } from './verification.service';

@Module({
  imports: [InfrastructureModule],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class LoginModule {}
