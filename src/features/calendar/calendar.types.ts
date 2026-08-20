import type { calendar_v3 } from 'googleapis';

export type SyncStatus = 'pending' | 'synced' | 'error' | 'conflict';

export interface AppointmentRecord {
  id: string;
  company_id: string;
  customer_id: string | null;
  staff_id: string | null;
  appointment_type: string;
  context_type: string;
  title: string | null;
  description: string | null;
  scheduled_start: Date | string;
  scheduled_end: Date | string;
  location: string | null;
  status: string;
  metadata: Record<string, unknown>;
  google_calendar_event_id: string | null;
  google_calendar_link: string | null;
  sync_status: SyncStatus;
  sync_error_message: string | null;
  last_synced_at: Date | string | null;
  google_updated_at: Date | string | null;
  db_updated_at: Date | string;
  sync_direction: string;
  conflict_resolution: string | null;
  target_calendar_id: string | null;
  booking_version?: number;
  catalog_item_id?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: Date | string | null;
}

export interface CreateAppointmentInput {
  companyId: string;
  customerPhone?: string;
  customerName?: string;
  staffId?: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  appointmentType?: string;
  contextType?: string;
  location?: string;
  targetCalendarId?: string;
  serviceId?: string;
  bufferMinutes?: number;
  createdByUserId?: string;
  metadata?: Record<string, unknown>;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  staffId: string | null;
  staffName: string | null;
  serviceId: string | null;
  durationMinutes: number;
}

export interface CalendarRegistryRecord {
  calendar_id: string;
  assigned_to_staff_id: string | null;
  is_primary: boolean;
}

export interface CompanyCalendarIntegration {
  company_id: string;
  sync_direction: string;
  sync_settings: Record<string, unknown>;
  last_sync_at: Date | string | null;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  webhook_expiration: Date | string | null;
  sync_frequency_minutes: number;
  last_full_sync_at: Date | string | null;
}

export interface SyncSummary {
  processed: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
}

export type GoogleEvent = calendar_v3.Schema$Event;
