require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

function migrationSql() {
  const file = path.resolve(
    __dirname,
    '../sql/whatsapp_calendar_conversation_hardening.sql',
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
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'whatsapp_inbound_message_receipts'
       ORDER BY ordinal_position
    `);
    const constraints = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
       WHERE conrelid = 'public.whatsapp_inbound_message_receipts'::regclass
       ORDER BY conname
    `);
    if (columns.rowCount !== 6) {
      throw new Error(
        'La tabla de idempotencia no tiene las 6 columnas esperadas',
      );
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(
      JSON.stringify(
        {
          applied: apply,
          table: 'whatsapp_inbound_message_receipts',
          columns: columns.rows,
          constraints: constraints.rows,
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
  console.error(error.message);
  process.exitCode = 1;
});
