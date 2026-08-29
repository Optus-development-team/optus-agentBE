import {
  createPendingAvailability,
  describeCalendarSlotSelection,
  findPendingCalendarSlot,
  isCalendarSlotToken,
} from './calendar-slot-selection';

describe('calendar slot selection', () => {
  const pending = createPendingAvailability({
    requestTime: '2026-08-29T10:00:00-04:00',
    date: '2026-08-31',
    timezone: 'America/La_Paz',
    slots: [
      {
        start: '2026-08-31T20:00:00.000Z',
        end: '2026-08-31T20:30:00.000Z',
        staffId: 'd16b0000-0000-4000-8000-000000000201',
        staffName: 'Erick',
        serviceId: 'd16b0000-0000-4000-8000-000000000401',
        durationMinutes: 30,
      },
    ],
  });

  it('crea un identificador compatible con WhatsApp y conserva el slot', () => {
    const token = pending.slots[0].token;
    expect(isCalendarSlotToken(token)).toBe(true);
    expect(token.length).toBeLessThanOrEqual(256);
    expect(findPendingCalendarSlot(pending, token)).toMatchObject({
      start: '2026-08-31T20:00:00.000Z',
      end: '2026-08-31T20:30:00.000Z',
      staffName: 'Erick',
    });
  });

  it('rechaza un token que no pertenece a la disponibilidad de la sesión', () => {
    expect(
      findPendingCalendarSlot(pending, 'calendar_slot:alterado'),
    ).toBeNull();
  });

  it('convierte la selección en una instrucción inequívoca para el agente', () => {
    const text = describeCalendarSlotSelection(pending.slots[0].token);
    expect(text).toContain('create_appointment');
    expect(text).toContain('slotToken=');
    expect(text).toContain(pending.slots[0].token);
  });
});
