require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

function migrationSql() {
  const file = path.resolve(
    __dirname,
    '../sql/calendar_registry_canonicalization.sql',
  );
  return fs
    .readFileSync(file, 'utf8')
    .replace(/^\s*BEGIN\s*;/i, '')
    .replace(/COMMIT\s*;\s*$/i, '');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rawUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!rawUrl) throw new Error('Falta SUPABASE_DB_URL');

  const connectionUrl = new URL(rawUrl);
  connectionUrl.searchParams.delete('sslmode');
  const client = new Client({
    connectionString: connectionUrl.toString(),
    ssl: {
      rejectUnauthorized: process.env.SUPABASE_DB_ALLOW_SELF_SIGNED !== 'true',
    },
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(migrationSql());

    const mismatches = await client.query(`
      SELECT staff.id, staff.first_name, staff.last_name,
             staff.google_calendar_id, registry.calendar_id
        FROM company_staff staff
        JOIN google_calendar_registry registry
          ON registry.company_id = staff.company_id
         AND registry.assigned_to_staff_id = staff.id
         AND registry.is_active = TRUE
       WHERE staff.google_calendar_id IS DISTINCT FROM registry.calendar_id
          OR staff.google_calendar_name IS DISTINCT FROM registry.calendar_name
    `);
    const invalidResolved = await client.query(`
      SELECT appointment.id,
             get_target_calendar_id_for_appointment(appointment.id) AS calendar_id
        FROM appointments appointment
       WHERE appointment.sync_status IN ('pending', 'error')
         AND NOT EXISTS (
           SELECT 1 FROM google_calendar_registry registry
            WHERE registry.company_id = appointment.company_id
              AND registry.calendar_id =
                  get_target_calendar_id_for_appointment(appointment.id)
              AND registry.is_active = TRUE
         )
    `);
    const indexes = await client.query(`
      SELECT indexname
        FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN (
           'uq_calendar_registry_active_staff',
           'uq_company_integrations_active_provider'
         )
       ORDER BY indexname
    `);

    if (mismatches.rowCount !== 0) {
      throw new Error('Persisten diferencias entre staff y el registro');
    }
    if (invalidResolved.rowCount !== 0) {
      throw new Error(
        `Hay ${invalidResolved.rowCount} citas pendientes sin calendario registrado`,
      );
    }
    if (indexes.rowCount !== 2) {
      throw new Error('No se crearon los índices de integridad esperados');
    }

    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(
      JSON.stringify(
        {
          applied: apply,
          canonicalSource: 'google_calendar_registry',
          staffRegistryMismatches: mismatches.rowCount,
          invalidPendingAppointments: invalidResolved.rowCount,
          indexes: indexes.rows.map((row) => row.indexname),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Calendar registry migration failed: ${error.message}`);
  process.exitCode = 1;
});
