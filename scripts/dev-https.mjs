#!/usr/bin/env node
/**
 * Arranca Vite por HTTPS con un certificado autofirmado.
 *
 * Es lo que hace falta para probar desde el móvil: la cámara (escáner QR y
 * fotos del perfil) y la geolocalización sólo funcionan en un origen seguro.
 * `localhost` cuenta como seguro aunque sea HTTP, pero `http://192.168.x.x` no,
 * así que por la red local hace falta HTTPS de verdad.
 *
 * El navegador avisará de que el certificado no es de confianza. Hay que
 * aceptar la excepción una vez por dispositivo; a partir de ahí el origen ya es
 * seguro y los permisos de cámara y ubicación se pueden conceder.
 *
 * Se hace con un script en vez de con `cross-env` para no añadir otra
 * dependencia sólo para exportar una variable.
 */
import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Direcciones IPv4 de la máquina, para no tener que buscarlas a mano. */
const direcciones = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
  // Las 169.254.x.x son de autoconfiguración: no sirven para llegar desde otro
  // dispositivo de la red.
  .filter((iface) => !iface.address.startsWith('169.254.'))
  .map((iface) => iface.address);

// El puerto lo decide Vite, que salta al siguiente libre si el 5173 está
// ocupado, así que aquí sólo se nombran las direcciones: las URLs completas las
// imprime Vite justo debajo.
const aviso = [
  'Para probar desde el móvil, conéctate a la misma wifi y abre la dirección',
  `de red que aparece abajo (${direcciones.join(', ') || 'ninguna detectada'}).`,
  '',
  'El certificado es autofirmado: el navegador dirá que la conexión no es',
  'privada. Entra en «Configuración avanzada» y acepta continuar. Sin ese',
  'paso la cámara y la ubicación quedan bloqueadas.',
  '',
];

for (const linea of aviso) console.log(linea);

const result = spawnSync('npx vite', {
  cwd: root,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, VYBE_HTTPS: 'true' },
});

process.exit(result.status ?? 1);
