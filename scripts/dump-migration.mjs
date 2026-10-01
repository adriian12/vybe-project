#!/usr/bin/env node
/**
 * Recupera de la base de datos el SQL de una migración ya aplicada y lo guarda
 * como fichero en `supabase/migrations/`.
 *
 *   node scripts/dump-migration.mjs vybe_019_promoters_capacity_recurrence 019_promoters_capacity_recurrence
 *
 * Sirve cuando una migración se aplicó por MCP o desde el panel y el
 * repositorio se quedó sin ella. Copiarla del historial de la base de datos es
 * más fiable que reescribirla de memoria: es exactamente lo que se ejecutó.
 *
 * Necesita `SUPABASE_SERVICE_ROLE_KEY` en el entorno o en `.env`, porque el
 * esquema `supabase_migrations` no está al alcance de la clave anónima.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readEnv, root } from './supabase-project.mjs';

const [nombreEnBase, nombreDeFichero] = process.argv.slice(2);

if (!nombreEnBase || !nombreDeFichero) {
  console.error(
    'Uso: node scripts/dump-migration.mjs <nombre en la base> <nombre del fichero sin .sql>',
  );
  process.exit(1);
}

const env = readEnv();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error(
    'Falta SUPABASE_SERVICE_ROLE_KEY. Está en el panel, en Settings > API.\n' +
      'En PowerShell:  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ…"',
  );
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, serviceKey, {
  auth: { persistSession: false },
  db: { schema: 'supabase_migrations' },
});

const { data, error } = await supabase
  .from('schema_migrations')
  .select('version, name, statements')
  .eq('name', nombreEnBase)
  .maybeSingle();

if (error) {
  console.error(`No se pudo leer el historial: ${error.message}`);
  process.exit(1);
}

if (!data) {
  console.error(`No hay ninguna migración aplicada con el nombre ${nombreEnBase}`);
  process.exit(1);
}

// `statements` es un array con cada sentencia por separado.
const sql = Array.isArray(data.statements) ? data.statements.join(';\n\n') : String(data.statements);
const destino = resolve(root, 'supabase/migrations', `${nombreDeFichero}.sql`);

writeFileSync(destino, `${sql.trimEnd()};\n`, 'utf8');
console.log(`${nombreEnBase} → ${destino}`);
