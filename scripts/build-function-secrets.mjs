#!/usr/bin/env node
/**
 * Genera `supabase/.env.functions` a partir de `.env`.
 *
 * `supabase secrets set --env-file .env` subiría también las variables VITE_*,
 * que son de cliente y no pintan nada como secretos de las Edge Functions.
 * Este script deja sólo lo que el servidor necesita y descarta lo que esté
 * vacío, para no crear secretos en blanco que luego confunden.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, '.env');
const target = resolve(root, 'supabase/.env.functions');

/** Supabase inyecta estas por su cuenta y rechaza que se definan a mano. */
const RESERVED = /^SUPABASE_/;

let raw;
try {
  raw = readFileSync(source, 'utf8');
} catch {
  console.error(`No se encontró ${source}. Copia .env.example y rellénalo.`);
  process.exit(1);
}

const kept = [];
const skippedEmpty = [];

for (const line of raw.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;

  const separator = trimmed.indexOf('=');
  const key = trimmed.slice(0, separator).trim();
  const value = trimmed.slice(separator + 1).trim();

  if (key.startsWith('VITE_') || RESERVED.test(key)) continue;
  if (!value) {
    skippedEmpty.push(key);
    continue;
  }

  kept.push(`${key}=${value}`);
}

if (kept.length === 0) {
  console.error('No hay ningún secreto de servidor con valor en .env.');
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${kept.join('\n')}\n`, 'utf8');

console.log(`${kept.length} secretos escritos en supabase/.env.functions`);
console.log(kept.map((line) => `  · ${line.split('=')[0]}`).join('\n'));

if (skippedEmpty.length > 0) {
  console.log(`\nSin valor, no se suben: ${skippedEmpty.join(', ')}`);
}
