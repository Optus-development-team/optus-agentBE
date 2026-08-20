import { CalendarSyncService } from './calendar-sync.service';
import type { AppointmentRecord } from './calendar.types';

const baseAppointment = (
  overrides: Partial<AppointmentRecord> = {},
): AppointmentRecord => ({
  id: 'a1',
  company_id: 'c1',
  customer_id: null,
  staff_id: 's1',
  appointment_type: 'service',
  context_type: 'service',
  title: 'Corte',
  description: null,
  scheduled_start: '2026-08-21T14:00:00.000Z',
  scheduled_end: '2026-08-21T14:30:00.000Z',
  location: null,
  status: 'confirmed',
  metadata: {},
  google_calendar_event_id: null,
  google_calendar_link: null,
  sync_status: 'pending',
  sync_error_message: null,
  last_synced_at: null,
  google_updated_at: null,
  db_updated_at: '2026-08-20T10:00:00.000Z',
  sync_direction: 'bidirectional',
  conflict_resolution: null,
  target_calendar_id: null,
  ...overrides,
});

describe('CalendarSyncService', () => {
  const appointments = {
    findById: jest.fn(),
    resolveCalendarId: jest.fn(),
    markSynced: jest.fn(),
    markSyncError: jest.fn(),
    upsertFromGoogle: jest.fn(),
  };
  const calendar = {
    createAppointment: jest.fn(),
    updateAppointment: jest.fn(),
    deleteAppointment: jest.fn(),
  };
  const logs = { start: jest.fn(), finish: jest.fn() };
  const db = { query: jest.fn() };
  let service: CalendarSyncService;

  beforeEach(() => {
    jest.resetAllMocks();
    appointments.resolveCalendarId.mockResolvedValue('staff-calendar');
    service = new CalendarSyncService(
      appointments as never,
      calendar as never,
      logs as never,
      db as never,
    );
  });

  it('crea el evento en el calendario resuelto para el staff', async () => {
    appointments.findById
      .mockResolvedValueOnce(baseAppointment())
      .mockResolvedValueOnce(
        baseAppointment({
          sync_status: 'synced',
          google_calendar_event_id: 'g1',
        }),
      );
    calendar.createAppointment.mockResolvedValue({
      id: 'g1',
      htmlLink: 'https://calendar.google/event',
      updated: '2026-08-20T11:00:00.000Z',
    });

    const result = await service.syncAppointmentToGoogle('c1', 'a1');

    expect(calendar.createAppointment).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        calendarId: 'staff-calendar',
        appointmentId: 'a1',
      }),
    );
    expect(appointments.markSynced).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ eventId: 'g1', calendarId: 'staff-calendar' }),
    );
    expect(result.sync_status).toBe('synced');
  });

  it('elimina el evento externo al cancelar', async () => {
    appointments.findById
      .mockResolvedValueOnce(
        baseAppointment({
          status: 'cancelled',
          google_calendar_event_id: 'g1',
        }),
      )
      .mockResolvedValueOnce(
        baseAppointment({ status: 'cancelled', sync_status: 'synced' }),
      );

    await service.syncAppointmentToGoogle('c1', 'a1');

    expect(calendar.deleteAppointment).toHaveBeenCalledWith(
      'c1',
      'staff-calendar',
      'g1',
    );
    expect(appointments.markSynced).toHaveBeenCalled();
  });

  it('marca error de sincronización sin borrar la cita', async () => {
    appointments.findById.mockResolvedValueOnce(baseAppointment());
    calendar.createAppointment.mockRejectedValue(new Error('quota exceeded'));

    await expect(service.syncAppointmentToGoogle('c1', 'a1')).rejects.toThrow(
      'quota exceeded',
    );
    expect(appointments.markSyncError).toHaveBeenCalledWith(
      'a1',
      'quota exceeded',
    );
  });

  it('resuelve un conflicto aplicando el estado de Google', async () => {
    db.query
      .mockResolvedValueOnce([
        {
          appointment_id: 'a1',
          google_state: {
            id: 'g1',
            summary: 'Cita modificada',
            start: { dateTime: '2026-08-21T15:00:00.000Z' },
            end: { dateTime: '2026-08-21T15:30:00.000Z' },
            updated: '2026-08-20T12:00:00.000Z',
          },
        },
      ])
      .mockResolvedValueOnce([]);
    appointments.findById
      .mockResolvedValueOnce(
        baseAppointment({
          google_calendar_event_id: 'g1',
          target_calendar_id: 'staff-calendar',
        }),
      )
      .mockResolvedValueOnce(baseAppointment({ sync_status: 'synced' }));
    appointments.upsertFromGoogle.mockResolvedValue(
      baseAppointment({ sync_status: 'synced' }),
    );

    const result = await service.resolveConflictById(
      'c1',
      'conflict-1',
      'google_wins',
      'admin-1',
    );

    expect(appointments.upsertFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        existingId: 'a1',
        calendarId: 'staff-calendar',
        start: '2026-08-21T15:00:00.000Z',
      }),
    );
    expect(result.sync_status).toBe('synced');
  });
});
