/**
 * Precio aproximado de volver a casa (fase 1 del plan del fiester@).
 *
 * `ride-estimate` sólo da kilómetros y minutos; el precio se calcula aquí para
 * poder probarlo y actualizarlo con cada versión. Todo es **aproximado**: la
 * pantalla lo dice y el precio final lo da la app.
 *
 * Sólo Uber y Cabify: el taxi se para en la calle. No publican su tarifa, así
 * que es una horquilla orientativa (base + €/km + €/min) con margen arriba de
 * madrugada por la demanda.
 */

export interface Punto {
  lat: number;
  lng: number;
}

export interface Rango {
  min: number;
  max: number;
}

/** Hora (0–23) y día de la semana (0 = domingo) en España peninsular y Baleares. */
export const horaEspana = (fecha: Date): { hora: number; dia: number } => {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(fecha);
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? 0);
  const nombre = partes.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nombre);
  return { hora, dia: dia < 0 ? 1 : dia };
};

/** Euros enteros, con al menos un euro de margen entre los extremos. */
const redondeo = (min: number, max: number): Rango => {
  const a = Math.max(1, Math.floor(min));
  return { min: a, max: Math.max(a + 1, Math.ceil(max)) };
};

export type Vtc = 'uber' | 'cabify';

const VTC: Record<Vtc, { base: number; km: number; minuto: number; minimo: number }> = {
  uber: { base: 1.2, km: 1.05, minuto: 0.22, minimo: 6 },
  cabify: { base: 1.5, km: 1.0, minuto: 0.25, minimo: 6.5 },
};

export const precioVtc = (app: Vtc, km: number, minutos: number, fecha: Date): Rango => {
  const t = VTC[app];
  const euros = Math.max(t.minimo, t.base + km * t.km + minutos * t.minuto);
  // De madrugada sube por la demanda.
  const { hora } = horaEspana(fecha);
  const subida = hora < 7 ? 1.6 : 1.3;
  return redondeo(euros, euros * subida);
};

/** Abre Uber con el destino puesto (sin la app, su web). */
export const uberLink = (destino: Punto & { label?: string }): string => {
  const p = new URLSearchParams({
    action: 'setPickup',
    pickup: 'my_location',
    'dropoff[latitude]': String(destino.lat),
    'dropoff[longitude]': String(destino.lng),
  });
  if (destino.label) p.set('dropoff[nickname]', destino.label);
  return `https://m.uber.com/ul/?${p.toString()}`;
};

/** Cabify no publica un enlace con destino: se abre su app o su web. */
export const CABIFY_LINK = 'https://cabify.com/es';
