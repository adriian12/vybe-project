#!/usr/bin/env node
/**
 * Ejecuta un fichero SQL contra el proyecto de Vybe por la API de gestión de
 * Supabase (la misma que usa el MCP).
 *
 *   node scripts/run-sql.mjs supabase/seeds/mallorca_test_data.sql
 *
 * El proyecto sale de VITE_SUPABASE_URL y el token de SUPABASE_ACCESS_TOKEN,
 * los dos de `.env`: nunca de la sesión del CLI, que en este equipo está con
 * otra cuenta. El token no se imprime.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRef, readEnv, root } from './supabase-project.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/run-sql.mjs <fichero.sql>');
  process.exit(1);
}

const env = readEnv();
const ref = projectRef(env);
const token = env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Falta SUPABASE_ACCESS_TOKEN en .env.');
  process.exit(1);
}

const query = readFileSync(resolve(root, file), 'utf8');
console.log(`Proyecto ${ref} · ${file} (${query.length} caracteres)`);

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`Error ${res.status}: ${text}`);
  process.exit(1);
}
console.log(text);
