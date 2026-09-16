/**
 * Identificador del proyecto Supabase de Vybe, deducido de `.env`.
 *
 * El CLI, cuando no le pasas `--project-ref`, usa el proyecto enlazado con
 * `supabase link` y, si no hay ninguno, pregunta y ofrece la lista de proyectos
 * de la cuenta con la que hiciste `supabase login`. Esa cuenta no tiene por qué
 * ser la que aloja Vybe: en este equipo hay varias, y la lista que sale es la de
 * otra. Pasar el ref explícitamente evita elegir el proyecto equivocado por
 * descuido y hace que, si el token no es el correcto, el error lo diga.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Lee `.env` como pares clave/valor. */
export const readEnv = () => {
  const source = resolve(root, '.env');
  let raw;
  try {
    raw = readFileSync(source, 'utf8');
  } catch {
    console.error(`No se encontró ${source}. Copia .env.example y rellénalo.`);
    process.exit(1);
  }

  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separator = trimmed.indexOf('=');
    env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return env;
};

/** El *project ref* es el subdominio de VITE_SUPABASE_URL. */
export const projectRef = (env = readEnv()) => {
  const url = env.VITE_SUPABASE_URL;
  if (!url) {
    console.error('Falta VITE_SUPABASE_URL en .env: no se puede saber a qué proyecto subir nada.');
    process.exit(1);
  }

  const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.(co|in)/i);
  if (!match) {
    console.error(`VITE_SUPABASE_URL no tiene la forma esperada: ${url}`);
    process.exit(1);
  }

  return match[1];
};
