// src/common/security/x402/x402.middleware.ts
// NOTE: X402 payment middleware is temporarily disabled.
// The @x402/* and @stellar/stellar-sdk packages were removed from dependencies.
// Re-enable by restoring the original implementation and re-adding the packages.
import { Injectable, Logger, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class X402DynamicMiddleware implements NestMiddleware {
  private readonly logger = new Logger(X402DynamicMiddleware.name);

  constructor() {
    this.logger.warn(
      'X402 payment middleware is DISABLED. @x402/* packages are not installed.',
    );
  }

  use(_req: Request, _res: Response, _next: NextFunction) {
    throw new ServiceUnavailableException(
      'X402 payment gateway is currently disabled.',
    );
  }
}