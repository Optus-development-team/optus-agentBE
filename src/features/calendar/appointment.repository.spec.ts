import { AppointmentRepository } from './appointment.repository';
import type { SupabaseService } from '../../common/intraestructure/supabase/supabase.service';

describe('AppointmentRepository', () => {
  it('actualiza un evento importado usando parámetros SQL consecutivos', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'appointment-1' }]);
    const repository = new AppointmentRepository({
      query,
    } as unknown as SupabaseService);

    await repository.upsertFromGoogle({
      companyId: 'company-1',
      calendarId: 'primary',
      staffId: null,
      eventId: 'google-event-1',
      title: 'Cita actualizada',
      description: null,
      location: null,
      start: '2026-08-25T17:00:00.000Z',
      end: '2026-08-25T18:00:00.000Z',
      status: 'confirmed',
      link: 'https://calendar.google.com/event',
      googleUpdatedAt: '2026-08-24T20:00:00.000Z',
      existingId: 'appointment-1',
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(values).toHaveLength(12);
    expect(
      [...sql.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])),
    ).toEqual(
      expect.arrayContaining(Array.from({ length: 12 }, (_, i) => i + 1)),
    );
    expect(sql).toContain('google_calendar_event_id = COALESCE');
    expect(values[10]).toBe('google-event-1');
  });
});
