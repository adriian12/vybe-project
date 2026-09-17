/**
 * Busca un JDK 21 para compilar la app de Android.
 *
 * Capacitor 8 (Android 16 / API 36) compila con Java 21, pero en este equipo
 * el JDK del sistema es el 17 y lo usan otros proyectos. En vez de cambiar el
 * `JAVA_HOME` global, los scripts de compilación usan el primero que encuentren
 * de esta lista:
 *
 *   1. `VYBE_JAVA_HOME`, si está puesta.
 *   2. `JAVA_HOME`, si ya es un 21 o posterior.
 *   3. El JBR de Android Studio (Otter trae el 21).
 *   4. `~/.jdks/jdk-21*` (donde lo dejan IntelliJ y Android Studio al
 *      descargarlo, y donde se instaló el Temurin 21 portátil).
 *   5. Temurin 21 instalado en Program Files.
 */
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const javaBin = (home) => join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');

const majorOf = (home) => {
  if (!home || !existsSync(javaBin(home))) return 0;
  const out = spawnSync(javaBin(home), ['-version'], { encoding: 'utf8' });
  const match = /version "(\d+)/.exec(`${out.stderr}${out.stdout}`);
  return match ? Number(match[1]) : 0;
};

const children = (dir, prefix) => {
  try {
    return readdirSync(dir)
      .filter((name) => name.startsWith(prefix))
      .sort()
      .reverse()
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
};

export const findJava21 = () => {
  const candidates = [
    process.env.VYBE_JAVA_HOME,
    process.env.JAVA_HOME,
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Android Studio', 'jbr'),
    ...children(join(homedir(), '.jdks'), 'jdk-21'),
    ...children(join(homedir(), '.jdks'), 'temurin-21'),
    ...children('C:\\Program Files\\Eclipse Adoptium', 'jdk-21'),
  ];

  return candidates.find((home) => majorOf(home) >= 21) ?? null;
};
