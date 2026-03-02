import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

@Injectable()
export class TimeService {
  constructor(private readonly config: ConfigService) {}

  getTimezone(phoneNumber?: string): string {
    const fallbackTimezone = this.config.get<string>(
      'TIMEZONE_FALLBACK',
      'UTC',
    );

    const phoneTimezone = this.resolveTimezoneFromPhoneNumber(phoneNumber);
    return phoneTimezone ?? fallbackTimezone;
  }

  getTodayDate(phoneNumber?: string): string {
    return this.getNow(phoneNumber).format('YYYY-MM-DD');
  }

  getCurrentDateTime(phoneNumber?: string): string {
    return this.getNow(phoneNumber).format();
  }

  getNow(phoneNumber?: string): Dayjs {
    const timezoneName = this.getTimezone(phoneNumber);
    return dayjs().tz(timezoneName);
  }

  resolveDateBounds(dateInput: string, phoneNumber?: string): {
    timezone: string;
    date: string;
    timeMinIso: string;
    timeMaxIso: string;
  } {
    const timezoneName = this.getTimezone(phoneNumber);
    const baseDate = this.parseDateInput(dateInput, timezoneName);

    return {
      timezone: timezoneName,
      date: baseDate.format('YYYY-MM-DD'),
      timeMinIso: baseDate.startOf('day').toISOString(),
      timeMaxIso: baseDate.endOf('day').toISOString(),
    };
  }

  buildAppointmentStart(date: string, time: string, phoneNumber?: string): {
    timezone: string;
    startIso: string;
  } {
    const timezoneName = this.getTimezone(phoneNumber);
    const startInTimezone = dayjs.tz(
      `${date} ${time}`,
      'YYYY-MM-DD HH:mm',
      timezoneName,
    );

    if (!startInTimezone.isValid()) {
      throw new Error('Fecha u hora inválida para la cita.');
    }

    return {
      timezone: timezoneName,
      startIso: startInTimezone.toISOString(),
    };
  }

  parseDurationToMinutes(durationText: string): number {
    const normalized = durationText.trim().toLowerCase();

    if (!normalized) {
      throw new Error('La duración es obligatoria.');
    }

    if (/^\d+$/.test(normalized)) {
      const minutes = Number(normalized);
      if (minutes <= 0) {
        throw new Error('La duración debe ser mayor a 0 minutos.');
      }
      return minutes;
    }

    const hourMatch = normalized.match(/(\d+)\s*(hora|horas|h)/);
    const minuteMatch = normalized.match(/(\d+)\s*(minuto|minutos|min|m)/);

    const hours = hourMatch ? Number(hourMatch[1]) : 0;
    const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes <= 0) {
      throw new Error(
        'No pude interpretar la duración. Ejemplos válidos: "1 hora", "15 minutos".',
      );
    }

    return totalMinutes;
  }

  private parseDateInput(dateInput: string, timezoneName: string): Dayjs {
    const normalized = dateInput.trim().toLowerCase();

    if (normalized === 'hoy') {
      return dayjs().tz(timezoneName);
    }

    if (normalized === 'mañana' || normalized === 'manana') {
      return dayjs().tz(timezoneName).add(1, 'day');
    }

    const parsedByFormat = dayjs.tz(dateInput, 'YYYY-MM-DD', timezoneName);
    if (parsedByFormat.isValid()) {
      return parsedByFormat;
    }

    const parsedIso = dayjs(dateInput).tz(timezoneName);

    if (!parsedIso.isValid()) {
      throw new Error(
        'No pude interpretar la fecha. Usa formato YYYY-MM-DD o expresiones como "hoy" o "mañana".',
      );
    }

    return parsedIso;
  }

  private resolveTimezoneFromPhoneNumber(phoneNumber?: string): string | null {
    if (!phoneNumber) {
      return null;
    }

    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    // TODO: Resolver zona horaria real usando el código de país del número de WhatsApp.
    // Ejemplo: extraer prefijo E.164 y mapearlo a timezone IANA por compañía/país.
    void normalizedPhone;

    return null;
  }
}
