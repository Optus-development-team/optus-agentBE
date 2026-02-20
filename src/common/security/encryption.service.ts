import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-ctr';
  private readonly password = 'secret-encryption-key-please-change-in-env'; // Fallback if env var missing

  constructor(private configService: ConfigService) {}

  async encrypt(text: string): Promise<string> {
    const password =
      this.configService.get<string>('ENCRYPTION_KEY') || this.password;
    const iv = randomBytes(16);
    const key = (await promisify(scrypt)(password, 'salt', 32)) as Buffer;
    const cipher = createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  async decrypt(hash: string): Promise<string> {
    if (!hash.includes(':')) {
      throw new Error('Invalid hash format');
    }
    const password =
      this.configService.get<string>('ENCRYPTION_KEY') || this.password;
    const [ivHex, encryptedHex] = hash.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const key = (await promisify(scrypt)(password, 'salt', 32)) as Buffer;

    const decipher = createDecipheriv(this.algorithm, key, iv);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString();
  }
}
