import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class BookingPolicyDto {
  @IsString() @IsOptional() timezone?: string;
  @IsInt() @Min(5) @Max(480) @IsOptional() slotDurationMinutes?: number;
  @IsInt() @Min(0) @Max(240) @IsOptional() bufferMinutes?: number;
  @IsInt() @Min(1) @Max(730) @IsOptional() maxAdvanceDays?: number;
  @IsInt() @Min(0) @Max(10080) @IsOptional() minAdvanceMinutes?: number;
  @IsInt() @Min(0) @Max(43200) @IsOptional() cancellationNoticeMinutes?: number;
  @IsArray() @IsInt({ each: true }) @IsOptional() remindersMinutes?: number[];
  @IsObject() @IsOptional() businessHours?: Record<
    number,
    Array<{ start: string; end: string }>
  >;
}

export class CreateBookableServiceDto {
  @IsString() name: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() category?: string;
  @IsInt() @Min(5) @Max(1440) durationMinutes: number;
  @IsInt() @Min(1) @Max(100) @IsOptional() capacity?: number;
  @IsNumber() @Min(0) @IsOptional() salePrice?: number;
  @IsString() @IsOptional() currency?: string;
}

export class UpdateBookableServiceDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() category?: string;
  @IsInt() @Min(5) @Max(1440) @IsOptional() durationMinutes?: number;
  @IsInt() @Min(1) @Max(100) @IsOptional() capacity?: number;
  @IsNumber() @Min(0) @IsOptional() salePrice?: number;
  @IsString() @IsOptional() currency?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsBoolean() @IsOptional() isBookable?: boolean;
}

export class CreateStaffDto {
  @IsString() firstName: string;
  @IsString() @IsOptional() lastName?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() phone?: string;
  @IsIn([
    'owner',
    'manager',
    'seller',
    'advisor',
    'barber',
    'teacher',
    'assistant',
    'admin',
  ])
  role: string;
  @IsString() @IsOptional() specialty?: string;
  @IsUUID() @IsOptional() userId?: string;
}

export class UpdateStaffDto {
  @IsString() @IsOptional() firstName?: string;
  @IsString() @IsOptional() lastName?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() specialty?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsBoolean() @IsOptional() calendarSyncEnabled?: boolean;
}

export class StaffServiceAssignmentDto {
  @IsUUID() serviceId: string;
  @IsInt() @Min(5) @Max(1440) @IsOptional() customDurationMinutes?: number;
}

export class SetStaffServicesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaffServiceAssignmentDto)
  services: StaffServiceAssignmentDto[];
}

export class WorkingHourDto {
  @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) start: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) end: string;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() effectiveTo?: string;
}

export class SetWorkingHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  hours: WorkingHourDto[];
}

export class CreateTimeOffDto {
  @IsISO8601() startsAt: string;
  @IsISO8601() endsAt: string;
  @IsString() @IsOptional() reason?: string;
}

export class RegisterCalendarDto {
  @IsString() calendarId: string;
  @IsString() calendarName: string;
  @IsIn(['primary', 'secondary', 'shared', 'resource']) calendarType: string;
  @IsUUID() @IsOptional() staffId?: string;
  @IsBoolean() @IsOptional() isPrimary?: boolean;
  @IsString() @IsOptional() color?: string;
}

export class AppointmentStatusDto {
  @IsIn(['confirmed', 'completed', 'no_show'])
  status: 'confirmed' | 'completed' | 'no_show';
  @IsString() @IsOptional() notes?: string;
}
