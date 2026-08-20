// src/common/security/x402/x402.module.ts
import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../intraestructure/infrastructure.module';
import { X402DynamicMiddleware } from './x402.middleware';

@Module({
  imports: [InfrastructureModule],
  providers: [X402DynamicMiddleware],
  exports: [X402DynamicMiddleware],
})
export class X402Module {}
