const dotenv = require('dotenv');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Client } = require('pg');

dotenv.config();

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('Falta --apply para confirmar la migración');
  }
  const rawUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!rawUrl) throw new Error('Falta SUPABASE_DB_URL');
  const url = new URL(rawUrl);
  url.searchParams.delete('sslmode');
  const client = new Client({
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized:
        process.env.SUPABASE_DB_ALLOW_SELF_SIGNED !== 'true',
    },
  });
  const migration = readFileSync(
    resolve(process.cwd(), 'sql/calendar_timestamp_timezone_migration.sql'),
    'utf8',
  );

  await client.connect();
  try {
    const before = await readState(client);
    await client.query(migration);
    const after = await readState(client);
    console.log(JSON.stringify({ applied: true, before, after }, null, 2));
  } finally {
    await client.end();
  }
}

async function readState(client) {
  const columns = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
      AND column_name IN ('scheduled_start', 'scheduled_end')
    ORDER BY ordinal_position
  `);
  const appointments = await client.query(`
    SELECT a.id,
           a.scheduled_start::text AS stored_start,
           CASE
             WHEN pg_typeof(a.scheduled_start)::text = 'timestamp with time zone'
               THEN to_char(
                 a.scheduled_start AT TIME ZONE COALESCE(c.timezone, 'UTC'),
                 'YYYY-MM-DD HH24:MI:SS'
               )
             ELSE to_char(a.scheduled_start, 'YYYY-MM-DD HH24:MI:SS')
           END AS company_local_start,
           c.timezone
    FROM appointments a
    JOIN companies c ON c.id = a.company_id
    ORDER BY a.created_at
  `);
  const snapshotTable = await client.query(`
    SELECT to_regclass('public.appointments_timezone_migration_backup') AS name
  `);
  const snapshotRows = snapshotTable.rows[0]?.name
    ? (
        await client.query(
          'SELECT count(*)::int AS count FROM public.appointments_timezone_migration_backup',
        )
      ).rows[0]?.count ?? 0
    : 0;
  return {
    columns: columns.rows,
    appointments: appointments.rows,
    snapshotRows,
  };
}

main().catch((error) => {
  console.error(`Calendar timezone migration failed: ${error.message}`);
  process.exitCode = 1;
});
