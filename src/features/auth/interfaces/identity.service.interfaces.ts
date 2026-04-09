export interface CompanyRow {
  id: string;
  name: string;
  vertical: string;
  config: unknown;
  whatsapp_admin_phone_ids?: string[] | null;
  whatsapp_display_phone_number?: NullableString;
  whatsapp_phone_id?: NullableString;
}

export interface CompanyUserRow {
  role?: NullableString;
  phone: string;
}
