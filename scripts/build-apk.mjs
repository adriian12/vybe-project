#!/usr/bin/env node
/**
 * Compila el APK de depuración y lo deja con el nombre con el que se reparte.
 *
 * Gradle siempre lo llama `app-debug.apk` y lo entierra en
 * `android/app/build/outputs/apk/debug/`. Eso está bien para la máquina, pero
 * lo que se le pasa a alguien para instalar tiene que llamarse como la
 * aplicación: es el nombre que verá en Descargas antes de tocarlo.
 *
 * Se ejecuta desde `npm run native:apk`, después de `cap sync`.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './supabase-project.mjs';

const NOMBRE = 'Vybe.apk';

const android = resolve(root, 'android');
const origen = resolve(android, 'app/build/outputs/apk/debug/app-debug.apk');
// Fuera de `vybe-project/` a propósito: así no acaba dentro del proyecto ni
// se cuela en un despliegue.
const destino = resolve(root, '..', NOMBRE);

// Dos cuidados, los dos de Windows:
//
//   · `shell: true` es obligatorio: desde Node 20.12 spawn se niega a ejecutar
//     un `.cmd` o un `.bat` sin shell, y falla con EINVAL.
//   · La ruta va entera y entre comillas. Con sólo `gradlew.bat` no lo
//     encuentra: si el comando sale de Git Bash, hereda
//     `NoDefaultCurrentDirectoryInExePath`, que le dice a cmd que no busque en
//     el directorio actual. Y la ruta lleva un espacio («Vybe App»), así que
//     sin comillas cmd la partiría en dos.
const wrapper = resolve(android, 'gradlew.bat');

const gradle = spawnSync(`"${wrapper}" assembleDebug --console=plain`, {
  cwd: android,
  shell: true,
  stdio: 'inherit',
});

if (gradle.status !== 0) {
  console.error('\nLa compilación ha fallado; no se copia nada.');
  process.exit(gradle.status ?? 1);
}

if (!existsSync(origen)) {
  console.error(`\nGradle terminó bien pero no está ${origen}.`);
  process.exit(1);
}

copyFileSync(origen, destino);

const megas = (statSync(destino).size / (1024 * 1024)).toFixed(1);
console.log(`\n${NOMBRE} — ${megas} MB`);
console.log(destino);
