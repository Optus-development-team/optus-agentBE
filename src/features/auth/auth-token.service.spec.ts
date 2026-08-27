import { AuthTokenService } from './auth-token.service';
import type { ConfigService } from '@nestjs/config';

describe('AuthTokenService', () => {
  const createConfig = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    }) as unknown as ConfigService;

  it('fails fast in production when no auth secret is configured', () => {
    expect(
      () => new AuthTokenService(createConfig({ NODE_ENV: 'production' })),
    ).toThrow('AUTH_JWT_SECRET o APP_JWT_SECRET debe configurarse');
  });

  it('issues and verifies a full auth token when a secret is configured', () => {
    const service = new AuthTokenService(
      createConfig({
        NODE_ENV: 'production',
        AUTH_JWT_SECRET: 'test-secret',
      }),
    );

    const token = service.issueToken({
      userId: 'user-1',
      companyId: 'company-1',
      role: 'ADMIN',
      email: 'admin@example.com',
      authState: 'FULL',
      phoneVerified: true,
    });

    expect(service.verifyToken(token)).toMatchObject({
      userId: 'user-1',
      companyId: 'company-1',
      role: 'ADMIN',
      email: 'admin@example.com',
      authState: 'FULL',
      phoneVerified: true,
    });
  });
});
