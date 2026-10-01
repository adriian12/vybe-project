#!/usr/bin/env node
/**
 * Ejecuta un comando del CLI de Supabase contra el proyecto de Vybe.
 *
 *   node scripts/run-supabase.mjs secrets set --env-file supabase/.env.functions
 *   node scripts/run-supabase.mjs functions deploy send-push
 *
 * Añade `--project-ref` por su cuenta y, si la sesión del CLI pertenece a otra
 * cuenta, lo explica en vez de dejar el error críptico del CLI. Es el fallo más
 * fácil de cometer aquí: hay varias cuentas de Supabase en juego y `supabase
 * login` guarda una sola, en el Administrador de credenciales de Windows.
 */
import { spawnSync } from 'node:child_process';
import { projectRef, readEnv, root } from './supabase-project.mjs';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Uso: node scripts/run-supabase.mjs <comando del CLI…>');
  process.exit(1);
}

const env = readEnv();
const ref = projectRef(env);
console.log(`Proyecto: ${ref}\n`);

/**
 * El token de acceso, tomado de `.env` si no está ya en el entorno.
 *
 * Escribirlo con `$env:SUPABASE_ACCESS_TOKEN = "sbp_…"` sólo lo deja puesto en
 * esa ventana de PowerShell: al abrir otra terminal desaparece, el CLI vuelve a
 * la sesión de `supabase login` —que aquí es de otra cuenta— y el comando falla
 * con un 403 que no explica nada. Guardándolo en `.env`, que está fuera de git,
 * funciona siempre y desde cualquier terminal.
 */
const token = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN;

// `shell: true` es obligatorio en Windows: desde Node 20.12 spawn se niega a
// ejecutar un `.cmd` (y `npx` lo es) sin shell, y falla con EINVAL.
const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const command = ['npx', 'supabase', ...args, '--project-ref', ref].map(quote).join(' ');

// El CLI reparte sus errores entre stdout y stderr según el subcomando: el 403
// de permisos llega por stdout, así que hay que mirar los dos.
const result = spawnSync(command, {
  cwd: root,
  shell: true,
  stdio: ['inherit', 'pipe', 'pipe'],
  encoding: 'utf8',
  env: token ? { ...process.env, SUPABASE_ACCESS_TOKEN: token } : process.env,
});

if (result.error) {
  console.error(`No se pudo ejecutar el CLI: ${result.error.message}`);
  process.exit(1);
}

const stdout = result.stdout ?? '';
const stderr = result.stderr ?? '';
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);

if (result.status !== 0) {
  const salida = `${stdout}
${stderr}`;
  const wrongAccount =
    /privileges|not found|no such project|does not exist|Access token not provided|not logged in|Unauthorized|403/i.test(
      salida,
    );

  if (wrongAccount) {
    console.error(
      [
        '',
        `El CLI no llega al proyecto ${ref}: la respuesta es 403 o "no encontrado".`,
        '',
        token
          ? 'Hay un SUPABASE_ACCESS_TOKEN puesto, pero no sirve para este proyecto.\nComprueba que es de la cuenta que aloja Vybe y que no ha caducado.'
          : [
              'No hay ningún SUPABASE_ACCESS_TOKEN, así que el CLI ha usado la sesión',
              'de `supabase login`, que en este equipo es de otra cuenta y no ve Vybe.',
              '',
              'Crea un token en https://supabase.com/dashboard/account/tokens y',
              'añádelo como una línea más de .env (está fuera de git):',
              '',
              '    SUPABASE_ACCESS_TOKEN=sbp_…',
              '',
              'Así queda puesto para siempre. Escribirlo con `$env:` en PowerShell',
              'sólo lo deja en esa ventana: al abrir otra terminal se pierde, y es',
              'la razón de que el comando funcionara una vez y luego no.',
            ].join('\n'),
      ].join('\n'),
    );
  }

  process.exit(result.status ?? 1);
}
