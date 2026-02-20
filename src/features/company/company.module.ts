import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../common/intraestructure/infrastructure.module';
import { SecurityModule } from '../../common/security/security.module';
import { CompanyController } from './company.controller';
import { CompanyService } from './services/company.service';

@Module({
  imports: [InfrastructureModule, SecurityModule],
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
