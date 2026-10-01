#!/usr/bin/env node
/**
 * Compila el Android App Bundle (AAB) firmado con la clave de subida, que es
 * lo que acepta Google Play, y lo deja en `D:\Webs\Vybe App\Fiestea.aab`.
 *
 *   · La clave y sus contraseñas están fuera del repositorio, en
 *     `D:\Webs\Vybe App\firma-android\keystore.properties` (véase
 *     `android/app/build.gradle`). Sin ellas no se compila: un AAB sin firmar
 *     no sirve para Play.
 *   · Google Play exige un `versionCode` mayor en cada subida: se usa el
 *     número de commits de la rama.
 *
 * Se ejecuta desde `npm run native:aab`, después de `cap sync`. Los mismos
 * cuidados de Windows que `build-apk.mjs`.
 */
import { execSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './supabase-project.mjs';
import { findJava21 } from './java21.mjs';

const NOMBRE = 'Fiestea.aab';
const android = resolve(root, 'android');
const origen = resolve(android, 'app/build/outputs/bundle/release/app-release.aab');
const destino = resolve(root, '..', NOMBRE);
const firma = process.env.FIESTEA_KEYSTORE_PROPERTIES ?? resolve(root, '..', 'firma-android', 'keystore.properties');

// Un AAB para Play con el cobro de la tienda apagado vendería Premium con
// Stripe dentro de la app, y Google lo rechaza (y puede retirar la app).
const ficherosEnv = ['.env', '.env.local', '.env.production', '.env.production.local'];
const apagado =
  process.env.VITE_STORE_BILLING === 'off' ||
  ficherosEnv.some((f) => {
    const ruta = resolve(root, f);
    return existsSync(ruta) && /^\s*VITE_STORE_BILLING\s*=\s*['"]?off['"]?\s*$/m.test(readFileSync(ruta, 'utf8'));
  });
if (apagado) {
  console.error('VITE_STORE_BILLING=off: quítalo del .env antes de compilar para Google Play (las compras deben ir por Google Play Billing).');
  process.exit(1);
}

if (!existsSync(firma)) {
  console.error(`Falta la clave de subida: ${firma}`);
  process.exit(1);
}

const java21 = findJava21();
if (!java21) {
  console.error('Falta un JDK 21. Instala Android Studio Otter o Temurin 21, o apunta VYBE_JAVA_HOME a uno.');
  process.exit(1);
}

const versionCode = Number(execSync('git rev-list --count HEAD', { cwd: root }).toString().trim());
console.log(`Java 21: ${java21} · versionCode ${versionCode}`);

const gradle = spawnSync(
  `"${resolve(android, 'gradlew.bat')}" bundleRelease -PfiesteaVersionCode=${versionCode} --console=plain`,
  { cwd: android, shell: true, stdio: 'inherit', env: { ...process.env, JAVA_HOME: java21 } },
);
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
console.log(`\n${NOMBRE} — ${megas} MB · versionCode ${versionCode}`);
console.log(destino);
