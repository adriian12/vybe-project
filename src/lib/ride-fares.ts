/**
 * Precio aproximado de volver a casa (fase 1 del plan del fiester@).
 *
 * `ride-estimate` sólo da kilómetros y minutos; el precio se calcula aquí para
 * poder probarlo y actualizarlo con cada versión. Todo es **aproximado**: la
 * pantalla lo dice y el precio final lo da el taxímetro o la app.
 *
 * Taxi: tarifa oficial de la zona, si está comprobada; si no, una media
 * española. Uber y Cabify no publican su tarifa: horquilla orientativa (base +
 * €/km + €/min) con margen arriba de madrugada por la demanda.
 */

export interface Punto {
  lat: number;
  lng: number;
}

export interface Rango {
  min: number;
  max: number;
}

interface TarifaTaxi {
  /** Bajada de bandera y €/km de día y de noche (o fin de semana). */
  dia: { bajada: number; km: number };
  noche: { bajada: number; km: number };
  /** ¿Es tarifa nocturna a esta hora (0–23) y día (0 = domingo)? */
  esNoche: (hora: number, dia: number) => boolean;
  /** Suplemento si el destino es el aeropuerto o el puerto. */
  aeropuerto?: { punto: Punto; euros: number };
  fuente: string;
}

export type ZonaTaxi = 'mallorca' | 'barcelona' | 'general';

const finDeSemana = (dia: number) => dia === 0 || dia === 6;

export const TARIFAS: Record<ZonaTaxi, TarifaTaxi> = {
  // Tarifa única de isla (Decreto 20/2025). El €/km nocturno no está
  // confirmado: se usa el diurno con un 15 % más hasta comprobarlo.
  mallorca: {
    dia: { bajada: 2.5, km: 1.2 },
    noche: { bajada: 2.85, km: 1.38 },
    esNoche: (hora, dia) => hora >= 21 || hora < 7 || finDeSemana(dia),
    aeropuerto: { punto: { lat: 39.5517, lng: 2.7388 }, euros: 4.65 },
    fuente: 'Consell de Mallorca, Decreto 20/2025 (revisar en 2026-11)',
  },
  // Área metropolitana desde el 19-01-2026: T-1 laborables de 8 a 20; T-2 de
  // noche y fines de semana. Cifras del borrador de la Diputación.
  barcelona: {
    dia: { bajada: 2.8, km: 1.35 },
    noche: { bajada: 2.8, km: 1.66 },
    esNoche: (hora, dia) => hora >= 20 || hora < 8 || finDeSemana(dia),
    fuente: 'AMB, borrador 2026 (confirmar definitivo)',
  },
  // Madrid, Málaga, Valencia, Ibiza y el resto: media española hasta tener la
  // tabla oficial de cada una.
  general: {
    dia: { bajada: 2.5, km: 1.2 },
    noche: { bajada: 3.0, km: 1.4 },
    esNoche: (hora, dia) => hora >= 21 || hora < 7 || finDeSemana(dia),
    fuente: 'Media orientativa',
  },
};

/** Distancia en km entre dos puntos (haversine). */
export const kmEntre = (a: Punto, b: Punto): number => {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** La zona por el origen del trayecto. */
export const zonaDe = (origen: Punto): ZonaTaxi => {
  const { lat, lng } = origen;
  if (lat > 39.2 && lat < 40.0 && lng > 2.3 && lng < 3.5) return 'mallorca';
  if (kmEntre(origen, { lat: 41.3874, lng: 2.1686 }) < 25) return 'barcelona';
  return 'general';
};

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

export const precioTaxi = (km: number, origen: Punto, destino: Punto | null, fecha: Date): Rango => {
  const tarifa = TARIFAS[zonaDe(origen)];
  const { hora, dia } = horaEspana(fecha);
  const t = tarifa.esNoche(hora, dia) ? tarifa.noche : tarifa.dia;
  let euros = t.bajada + km * t.km;
  if (tarifa.aeropuerto && destino && kmEntre(destino, tarifa.aeropuerto.punto) < 1.5) {
    euros += tarifa.aeropuerto.euros;
  }
  // El taxímetro también cuenta el tiempo parado: algo de margen arriba.
  return redondeo(euros * 0.95, euros * 1.15);
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

/** Sin teléfonos de radio taxi comprobados: taxis cerca en el mapa. */
export const taxiLink = (origen: Punto): string =>
  `https://www.google.com/maps/search/taxi/@${origen.lat},${origen.lng},15z`;
