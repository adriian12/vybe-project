#!/usr/bin/env node
/**
 * Despliega las Edge Functions.
 *
 *   node scripts/deploy-functions.mjs              # todas
 *   node scripts/deploy-functions.mjs send-push    # sólo ésas
 *
 * La lista sale de `supabase/functions/`, no de `package.json`. Antes estaba
 * escrita a mano y se quedó sin `admin-create-account`: la función existía, el
 * cliente la llamaba y nunca se desplegaba, así que la consola de
 * administración fallaba con un 404 mientras el comando terminaba sin error.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const dir = join(aqui, '..', 'supabase', 'functions');

/** Cada carpeta es una función; `_shared` es código común, no se despliega. */
const todas = readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
  .map((e) => e.name)
  .sort();

const pedidas = process.argv.slice(2);
const desconocidas = pedidas.filter((n) => !todas.includes(n));
if (desconocidas.length > 0) {
  console.error(`No existen en supabase/functions/: ${desconocidas.join(', ')}`);
  process.exit(1);
}

const funciones = pedidas.length > 0 ? pedidas : todas;
console.log(`Desplegando ${funciones.length} funciones:\n  ${funciones.join('\n  ')}\n`);

const r = spawnSync(
  process.execPath,
  [join(aqui, 'run-supabase.mjs'), 'functions', 'deploy', ...funciones],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
