import type { AvailabilitySlot } from './calendar.types';

export const CALENDAR_SLOT_PREFIX = 'calendar_slot:';
export const PENDING_AVAILABILITY_STATE_KEY = 'app:pendingAvailability';

export interface PendingCalendarSlot extends AvailabilitySlot {
  token: string;
}

export interface PendingAvailability {
  requestTime: string;
  date: string;
  timezone: string;
  serviceName?: string;
  slots: PendingCalendarSlot[];
}

export function createPendingAvailability(params: {
  requestTime: string;
  date: string;
  timezone: string;
  serviceName?: string;
  slots: AvailabilitySlot[];
}): PendingAvailability {
  return {
    requestTime: params.requestTime,
    date: params.date,
    timezone: params.timezone,
    serviceName: params.serviceName,
    slots: params.slots.slice(0, 10).map((slot, index) => ({
      ...slot,
      token: encodeSlotToken(index, slot),
    })),
  };
}

export function readPendingAvailability(
  value: unknown,
): PendingAvailability | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PendingAvailability>;
  if (
    typeof candidate.requestTime !== 'string' ||
    typeof candidate.date !== 'string' ||
    typeof candidate.timezone !== 'string' ||
    !Array.isArray(candidate.slots)
  ) {
    return null;
  }
  return candidate as PendingAvailability;
}

export function findPendingCalendarSlot(
  pendingValue: unknown,
  token: string,
): PendingCalendarSlot | null {
  const pending = readPendingAvailability(pendingValue);
  return pending?.slots.find((slot) => slot.token === token) ?? null;
}

export function isCalendarSlotToken(value: string): boolean {
  return value.startsWith(CALENDAR_SLOT_PREFIX);
}

export function describeCalendarSlotSelection(token: string): string {
  return isCalendarSlotToken(token)
    ? `El cliente seleccionó un horario exacto. Usa create_appointment con slotToken="${token}" y no reconstruyas la fecha ni la hora desde el historial.`
    : token;
}

function encodeSlotToken(index: number, slot: AvailabilitySlot): string {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      i: index,
      s: slot.start,
      e: slot.end,
      f: slot.staffId ?? null,
      c: slot.serviceId ?? null,
    }),
  ).toString('base64url');
  return `${CALENDAR_SLOT_PREFIX}${payload}`;
}
