const dotenv = require('dotenv');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { Client } = require('pg');

dotenv.config();

async function main() {
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
  const migrationPath = resolve(
    process.cwd(),
    'sql/calendar_timestamp_timezone_migration.sql',
  );
  const migration = readFileSync(migrationPath, 'utf8').replace(
    /COMMIT;\s*$/,
    'ROLLBACK;',
  );
  if (!migration.endsWith('ROLLBACK;')) {
    throw new Error('No se pudo convertir el COMMIT final en ROLLBACK');
  }

  await client.connect();
  try {
    await client.query(migration);
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'appointments'
        AND column_name IN ('scheduled_start', 'scheduled_end')
      ORDER BY ordinal_position
    `);
    const backup = await client.query(`
      SELECT to_regclass('public.appointments_timezone_migration_backup') AS table_name
    `);
    console.log(
      JSON.stringify(
        {
          migrationValidated: true,
          transactionRolledBack: true,
          columnsAfterCheck: result.rows,
          persistentBackupTable: backup.rows[0]?.table_name ?? null,
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
  console.error(`Calendar timezone migration check failed: ${error.message}`);
  process.exitCode = 1;
});
