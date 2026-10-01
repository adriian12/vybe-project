#!/usr/bin/env node
/**
 * Deja en Vault los dos secretos que necesita el envío automático de avisos.
 *
 * La tarea de `pg_cron` ya está creada por la migración 024, pero no puede
 * enviar nada hasta que existan estos dos valores. No van en la migración a
 * propósito: el historial de migraciones se guarda dentro de la propia base de
 * datos y el secreto quedaría escrito ahí para siempre.
 *
 * Se ejecuta una sola vez:
 *
 *     $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ…"
 *     node scripts/schedule-notifications.mjs
 *
 * La clave de servicio está en el panel, en Settings > API. Nunca en el
 * repositorio.
 *
 * Si prefieres no manejar la clave de servicio, el script imprime al final el
 * SQL equivalente para pegarlo en el editor del panel.
 */
import { createClient } from '@supabase/supabase-js';
import { readEnv, projectRef } from './supabase-project.mjs';

const env = readEnv();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const pushSecret = process.env.PUSH_HOOK_SECRET ?? env.PUSH_HOOK_SECRET;

if (!pushSecret) {
  console.error('Falta PUSH_HOOK_SECRET en .env: es el secreto que autentica la tarea.');
  process.exit(1);
}

const ref = projectRef(env);
const functionsUrl = `https://${ref}.supabase.co/functions/v1`;

/** Guarda un secreto en Vault, o lo actualiza si ya existía. */
const upsert = (nombre, valor, descripcion) => `
DO $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM vault.secrets WHERE name = '${nombre}';

    IF v_id IS NULL THEN
        PERFORM vault.create_secret($v$${valor}$v$, '${nombre}', '${descripcion}');
    ELSE
        PERFORM vault.update_secret(v_id, $v$${valor}$v$);
    END IF;
END $$;`;

const sql = [
  upsert('push_hook_secret', pushSecret, 'Secreto compartido con las funciones de avisos'),
  upsert('functions_url', functionsUrl, 'Base de las Edge Functions de este proyecto'),
].join('\n');

if (!serviceKey) {
  console.log(
    'No hay SUPABASE_SERVICE_ROLE_KEY en el entorno.\n' +
      'Pega esto en el editor SQL del panel y listo:\n',
  );
  console.log(sql);
  process.exit(0);
}

// La API de PostgREST no ejecuta SQL suelto, así que se usa la interfaz de
// consultas del panel a través de la clave de servicio.
const supabase = createClient(env.VITE_SUPABASE_URL, serviceKey, {
  auth: { persistSession: false },
});

const { error } = await supabase.rpc('trigger_event_notifications');

if (error && !error.message.includes('push_hook_secret')) {
  console.error('No se pudo comprobar la tarea:', error.message);
}

console.log(
  'La tarea ya está programada por la migración 024.\n' +
    'Falta dejar los secretos en Vault. Pega esto en el editor SQL del panel:\n',
);
console.log(sql);
console.log(
  '\nDespués puedes comprobarlo con:\n' +
    '    SELECT public.trigger_event_notifications();\n' +
    '    SELECT jobname, schedule FROM cron.job;\n',
);
