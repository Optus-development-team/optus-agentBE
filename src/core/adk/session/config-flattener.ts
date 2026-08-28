import type { UserRole } from '../../../features/messaging/features/whatsapp/types/whatsapp.types';

/**
 * Mapeo de claves largas del config de companies a versiones ultracortas.
 * Cada entrada: [secciónPadre, claveHija, claveCorta, tipo]
 * tipo: 'v' = valor directo, 'csv' = array/obj → string separado por comas
 */
const KEY_MAP: Array<{
  section: string;
  key: string;
  short: string;
  kind: 'value' | 'csv-true-keys' | 'csv-array';
}> = [
  // agent_profile
  { section: 'agent_profile', key: 'tone', short: 'tone', kind: 'value' },
  { section: 'agent_profile', key: 'language', short: 'lang', kind: 'value' },
  { section: 'agent_profile', key: 'agent_name', short: 'name', kind: 'value' },
  { section: 'agent_profile', key: 'persona_description', short: 'persona', kind: 'value' },

  // agent_behavior
  { section: 'agent_behavior', key: 'response_style', short: 'style', kind: 'value' },
  { section: 'agent_behavior', key: 'fallback_message', short: 'fallback', kind: 'value' },
  { section: 'agent_behavior', key: 'address_customer_as', short: 'addr_as', kind: 'value' },
  { section: 'agent_behavior', key: 'confirm_before_actions', short: 'confirm', kind: 'value' },
  { section: 'agent_behavior', key: 'ask_clarifying_questions', short: 'ask_q', kind: 'value' },
  { section: 'agent_behavior', key: 'never_invent_information', short: 'no_invent', kind: 'value' },
  { section: 'agent_behavior', key: 'educational_mode_enabled', short: 'edu_mode', kind: 'value' },

  // agent_admin_security (solo admin)
  { section: 'agent_admin_security', key: 'protect_sensitive_data', short: 'protect_data', kind: 'value' },
  { section: 'agent_admin_security', key: 'require_2fa_for_admin_actions', short: 'req_2fa', kind: 'value' },

  // agent_capabilities (aplanado: solo las keys con valor true)
  { section: 'agent_capabilities', key: '__self__', short: 'caps', kind: 'csv-true-keys' },

  // agent_sales_policy
  { section: 'agent_sales_policy', key: 'accepted_payment_methods', short: 'pay_methods', kind: 'csv-array' },

  // agent_client_operational_rules (solo client)
  { section: 'agent_client_operational_rules', key: 'human_handoff_enabled', short: 'handoff', kind: 'value' },
  { section: 'agent_client_operational_rules', key: 'human_handoff_message', short: 'handoff_msg', kind: 'value' },
  { section: 'agent_client_operational_rules', key: 'walk_ins_allowed', short: 'walk_ins', kind: 'value' },

  // agent_client_appointment_policy (solo client)
  { section: 'agent_client_appointment_policy', key: 'enabled', short: 'appt_on', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'service_name', short: 'svc_name', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'cancellation_rule', short: 'cancel_rule', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'slot_duration_minutes', short: 'slot_min', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'max_advance_booking_days', short: 'max_adv_days', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'cancellation_notice_minutes', short: 'cancel_min', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'min_advance_booking_minutes', short: 'min_adv_min', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'buffer_between_appointments_minutes', short: 'buffer_min', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'deposit_required_percentage', short: 'deposit_pct', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'deposit_amount', short: 'deposit_amt', kind: 'value' },
  { section: 'agent_client_appointment_policy', key: 'reminders_minutes', short: 'remind_min', kind: 'csv-array' },
];

/**
 * Secciones restringidas por rol.
 * - Secciones con prefijo `agent_client_` → solo role CLIENT
 * - Secciones con prefijo `agent_admin_`  → solo role ADMIN
 * - Secciones con solo `agent_` (sin client/admin) → todos los roles
 */
function isSectionAllowed(section: string, role: string): boolean {
  if (section.startsWith('agent_client_')) {
    return role === 'CLIENT';
  }
  if (section.startsWith('agent_admin_')) {
    return role === 'ADMIN';
  }
  // agent_profile, agent_behavior, agent_capabilities, agent_sales_policy, agent_extensions → todos
  return section.startsWith('agent');
}

/**
 * Comprueba si un valor es "vacío" y debe descartarse.
 * Descarta: null, undefined, '', false, 0, {}, []
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value === '') return true;
  if (value === false) return true;
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.length === 0;
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

/**
 * Transforma y aplana el config crudo de la tabla companies en un objeto
 * compacto con claves cortas, filtrado por rol y sin valores vacíos.
 *
 * El resultado se inyecta en el estado de la sesión con prefijo `agent:`.
 *
 * @param rawConfig - JSON del campo `config` de la tabla companies
 * @param role - Rol del usuario (ADMIN | CLIENT)
 * @returns Objeto plano con claves cortas prefijadas con `agent:`
 */
export function flattenCompanyConfig(
  rawConfig: Record<string, unknown>,
  role: UserRole | string,
): Record<string, string | number | boolean> {
  const normalizedRole = (typeof role === 'string' ? role : 'CLIENT').toUpperCase();
  const result: Record<string, string | number | boolean> = {};

  for (const mapping of KEY_MAP) {
    if (!isSectionAllowed(mapping.section, normalizedRole)) {
      continue;
    }

    const section = rawConfig[mapping.section];
    if (!section || typeof section !== 'object') {
      continue;
    }

    const sectionObj = section as Record<string, unknown>;

    if (mapping.kind === 'csv-true-keys') {
      // Aplana un objeto { key: boolean } → string CSV de keys con valor true
      const trueKeys = Object.entries(sectionObj)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      if (trueKeys.length > 0) {
        result[`agent:${mapping.short}`] = trueKeys.join(',');
      }
      continue;
    }

    if (mapping.kind === 'csv-array') {
      const val = sectionObj[mapping.key];
      if (Array.isArray(val) && val.length > 0) {
        result[`agent:${mapping.short}`] = val.join(',');
      }
      continue;
    }

    // kind === 'value'
    const val = sectionObj[mapping.key];
    if (isEmpty(val)) {
      continue;
    }

    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      result[`agent:${mapping.short}`] = val;
    }
  }

  return result;
}
