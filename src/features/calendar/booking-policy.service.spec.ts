import { BadRequestException } from '@nestjs/common';
import { BookingPolicyService } from './booking-policy.service';

describe('BookingPolicyService', () => {
  const db = { query: jest.fn() };
  const service = new BookingPolicyService(db as never);

  beforeEach(() => jest.resetAllMocks());

  it('rechaza zonas horarias inexistentes antes de escribir', async () => {
    await expect(
      service.update('c1', { timezone: 'Mars/Olympus' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rechaza intervalos de negocio solapados', async () => {
    await expect(
      service.update('c1', {
        businessHours: {
          1: [
            { start: '09:00', end: '12:00' },
            { start: '11:00', end: '13:00' },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });
});
