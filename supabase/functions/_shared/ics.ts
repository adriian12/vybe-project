/**
 * Un evento de calendario (`.ics`, RFC 5545) para «Añadir al calendario».
 *
 * Sin dependencias, para poder probarlo con Vitest desde `src/`. Las horas van
 * en UTC (`Z`): así cada calendario las enseña en la zona del móvil sin tener
 * que mandar la definición de la zona horaria.
 */

export interface IcsEvent {
  id: string;
  name: string;
  start: Date;
  end: Date;
  /** Local, dirección y ciudad; lo que haya. */
  location?: string | null;
  description?: string | null;
  url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Aviso del propio calendario, en minutos antes del inicio. */
  alarmMinutes?: number;
}

/** 20261103T220000Z */
export const icsDate = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Comas, puntos y coma, barras y saltos de línea van escapados. */
export const icsEscape = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/**
 * Las líneas no pasan de 75 bytes: las siguientes empiezan con un espacio. Se
 * corta por caracteres completos para no partir una letra con tilde.
 */
export const icsFold = (line: string): string => {
  const encoder = new TextEncoder();
  const trozos: string[] = [];
  let actual = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limite = trozos.length === 0 ? 75 : 74;
    if (bytes + size > limite) {
      trozos.push(actual);
      actual = '';
      bytes = 0;
    }
    actual += char;
    bytes += size;
  }
  trozos.push(actual);
  return trozos.join('\r\n ');
};

export const buildIcs = (event: IcsEvent, now: Date = new Date()): string => {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fiestea//Fiestea//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    // El mismo UID cada vez: si se añade dos veces, el calendario lo actualiza.
    `UID:${event.id}@fiestea.es`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${icsEscape(event.name)}`,
  ];
  if (event.location) lineas.push(`LOCATION:${icsEscape(event.location)}`);
  if (event.latitude != null && event.longitude != null) {
    lineas.push(`GEO:${event.latitude.toFixed(6)};${event.longitude.toFixed(6)}`);
  }
  if (event.description) lineas.push(`DESCRIPTION:${icsEscape(event.description)}`);
  if (event.url) lineas.push(`URL:${event.url}`);
  if (event.alarmMinutes && event.alarmMinutes > 0) {
    lineas.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(event.name)}`,
      `TRIGGER:-PT${Math.round(event.alarmMinutes)}M`,
      'END:VALARM',
    );
  }
  lineas.push('END:VEVENT', 'END:VCALENDAR');
  return lineas.map(icsFold).join('\r\n') + '\r\n';
};

/** «Aurora Sessions» → «aurora-sessions», para el nombre del fichero. */
export const icsFileName = (name: string): string => {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'fiesta'}.ics`;
};
