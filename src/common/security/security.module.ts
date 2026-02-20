import { Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { EncryptionService } from './encryption.service';

@Module({
  providers: [TokenService, EncryptionService],
  exports: [TokenService, EncryptionService],
})
export class SecurityModule {}
