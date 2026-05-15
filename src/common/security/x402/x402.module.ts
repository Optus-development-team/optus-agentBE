// src/common/security/x402/x402.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // <-- Importar ConfigModule
import { X402IdempotencyService } from './x402-idempotency.service';
import { InfrastructureModule } from '../../intraestructure/infrastructure.module';
import { X402DynamicMiddleware } from './x402.middleware';

@Module({
  imports: [
    InfrastructureModule, 
    ConfigModule // <-- Añadir a los imports
  ], 
  providers: [X402IdempotencyService, X402DynamicMiddleware],
  exports: [X402IdempotencyService], 
})
export class X402Module {}