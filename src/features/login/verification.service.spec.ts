import { VerificationService } from './verification.service';
import type { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';

describe('VerificationService', () => {
  const createService = (query: jest.Mock) => {
    const supabase = {
      isEnabled: jest.fn(() => true),
      query,
    } as unknown as SupabaseService;

    return new VerificationService(supabase);
  };

  it('marks a company user as verified through a bounded CTE update', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'user-1' }]);
    const service = createService(query);

    await expect(
      service.markPhoneVerifiedByCompany('company-1', '+591 70000000'),
    ).resolves.toBe(true);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('WITH target AS');
    expect(sql).toContain('UPDATE company_users cu');
    expect(sql).toContain('RETURNING cu.id');
    expect(params).toEqual(['59170000000', 'company-1']);
  });

  it('does not report a user phone as verified when the OTP is valid but DB persistence is missing', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'code-1',
          phone: '59170000000',
          code: 'ABCD',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          verified: true,
          created_at: '2026-08-23T12:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([]);
    const service = createService(query);

    await expect(
      service.getUserPhoneStatus('user-1', '+591 70000000'),
    ).resolves.toMatchObject({
      verified: false,
      codeVerified: true,
      phonePersisted: false,
      linkedAt: null,
    });
  });
});
