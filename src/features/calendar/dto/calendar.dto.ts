import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  title: string;

  @IsISO8601()
  start: string;

  @IsISO8601()
  end: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsUUID()
  @IsOptional()
  staffId?: string;

  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @IsString()
  @IsOptional()
  targetCalendarId?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class RescheduleAppointmentDto {
  @IsISO8601()
  start: string;

  @IsISO8601()
  end: string;
}

export class CancelAppointmentDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ListAppointmentsQueryDto {
  @IsString()
  @IsOptional()
  phone?: string;

  @IsIn(['all', 'upcoming', 'past', 'cancelled'])
  @IsOptional()
  status?: 'all' | 'upcoming' | 'past' | 'cancelled';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export class AvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @IsUUID()
  @IsOptional()
  staffId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  @IsOptional()
  durationMinutes?: number;
}

export class ResolveConflictDto {
  @IsIn(['google_wins', 'db_wins', 'ignore'])
  strategy: 'google_wins' | 'db_wins' | 'ignore';

  @IsString()
  @IsOptional()
  notes?: string;
}
