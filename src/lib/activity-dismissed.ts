/**
 * Avisos descartados de la campana de inicio.
 *
 * No hay tabla de avisos: se calculan con lo que la app ya tiene cargado, así
 * que descartarlos se guarda aquí, en este dispositivo. Cada id se apunta con
 * la hora, y a las 48 horas se olvida solo para que la lista no crezca. Los
 * avisos cuyo id cambia cuando hay algo nuevo (un mensaje nuevo trae otro id)
 * vuelven a salir, que es lo que se espera.
 */
const CLAVE = 'vybe_avisos_ocultos';
const CADUCA_MS = 48 * 3_600_000;

type Ocultos = Record<string, number>;

let cache: Ocultos | null = null;
const oyentes = new Set<() => void>();

const leer = (): Ocultos => {
  if (cache) return cache;
  try {
    const crudo = JSON.parse(window.localStorage.getItem(CLAVE) ?? '{}') as Ocultos;
    const ahora = Date.now();
    cache = Object.fromEntries(Object.entries(crudo).filter(([, t]) => ahora - t < CADUCA_MS));
  } catch {
    // Sin almacenamiento (ventana privada, permisos): nada oculto.
    cache = {};
  }
  return cache;
};

const guardar = (valor: Ocultos) => {
  cache = valor;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(valor));
  } catch {
    // Se queda sólo en memoria hasta cerrar la app.
  }
  oyentes.forEach((fn) => fn());
};

/** Para `useSyncExternalStore`. */
export const suscribirOcultos = (fn: () => void) => {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
};

export const avisosOcultos = (): Ocultos => leer();

export const ocultarAviso = (id: string) => guardar({ ...leer(), [id]: Date.now() });

/** Vuelve a enseñar todos: se usa al cerrar sesión. */
export const limpiarAvisosOcultos = () => guardar({});
