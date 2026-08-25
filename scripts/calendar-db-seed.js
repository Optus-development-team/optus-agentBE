const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('Usa --apply para confirmar la carga de datos de prueba');
  }

  const rawUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!rawUrl) throw new Error('Falta SUPABASE_DB_URL');

  const connectionUrl = new URL(rawUrl);
  connectionUrl.searchParams.delete('sslmode');
  const pool = new Pool({
    connectionString: connectionUrl.toString(),
    max: 1,
    connectionTimeoutMillis: 8_000,
    ssl: {
      rejectUnauthorized: process.env.SUPABASE_DB_ALLOW_SELF_SIGNED !== 'true',
    },
  });

  try {
    const sql = readFileSync(
      resolve(__dirname, '../sql/calendar_functional_seed.sql'),
      'utf8',
    );
    const result = await pool.query(sql);
    const summary = [...result].reverse().find((item) => item.rows?.length);
    console.log(
      JSON.stringify(summary?.rows?.[0] ?? { seeded: true }, null, 2),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Calendar seed failed: ${error.message}`);
  process.exitCode = 1;
});
