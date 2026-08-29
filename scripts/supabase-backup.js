const { mkdirSync, statSync, unlinkSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolve6 } = require('node:dns/promises');
const dotenv = require('dotenv');

dotenv.config();

const pgDump = 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe';

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .slice(0, 15);
}

function runDump(connection, password, output, format) {
  const result = spawnSync(
    pgDump,
    [
      '--verbose',
      '--no-password',
      '--format',
      format,
      '--file',
      output,
      '--dbname',
      connection,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        PGPASSWORD: password,
        PGCONNECT_TIMEOUT: '15',
        PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=120000',
      },
    },
  );
  if (result.status !== 0) {
    try {
      if (statSync(output).size === 0) unlinkSync(output);
    } catch {}
    throw new Error(`pg_dump falló para ${output} (código ${result.status})`);
  }
  if (statSync(output).size === 0) {
    unlinkSync(output);
    throw new Error(`pg_dump generó un archivo vacío: ${output}`);
  }
}

async function main() {
  const rawUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!rawUrl) throw new Error('Falta SUPABASE_DB_URL');
  const url = new URL(rawUrl);
  const addresses = await resolve6(url.hostname);
  if (!addresses[0]) throw new Error('No se pudo resolver la dirección IPv6');
  const connection = [
    `host=${url.hostname}`,
    `hostaddr=${addresses[0]}`,
    `port=${url.port || '5432'}`,
    `dbname=${decodeURIComponent(url.pathname.slice(1))}`,
    `user=${decodeURIComponent(url.username)}`,
    'sslmode=require',
    'application_name=optus_pg_dump',
  ].join(' ');
  const directory = resolve(process.cwd(), 'backups');
  mkdirSync(directory, { recursive: true });
  const suffix = timestamp();
  const customPath = resolve(directory, `supabase_backup_${suffix}.dump`);
  const sqlPath = resolve(directory, `supabase_backup_${suffix}.sql`);

  runDump(connection, decodeURIComponent(url.password), customPath, 'custom');
  runDump(connection, decodeURIComponent(url.password), sqlPath, 'plain');

  console.log(
    JSON.stringify(
      {
        customPath,
        customBytes: statSync(customPath).size,
        sqlPath,
        sqlBytes: statSync(sqlPath).size,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`Supabase backup failed: ${error.message}`);
  process.exitCode = 1;
});
