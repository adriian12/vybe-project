/**
 * Line-up de un evento (migración 105): quién actúa, a qué hora y su
 * Instagram. Se guarda en `events.lineup` como JSON y la base de datos lo
 * valida (`valid_lineup`), así que aquí se limpia antes de guardar.
 */
export interface LineupArtist {
  name: string;
  /** Texto libre corto: «01:30 – 03:00» o «23:30». */
  time?: string | null;
  /** Usuario de Instagram, sin @ ni enlace. */
  instagram?: string | null;
}

export const MAX_LINEUP = 30;

/** «@dj.martin», «instagram.com/dj.martin/» o «dj.martin» → «dj.martin». */
export const instagramHandle = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const limpio = raw
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(limpio) ? limpio : null;
};

export const instagramUrl = (handle: string) => `https://www.instagram.com/${handle}/`;

/** Lo que llega de la base de datos (JSON), en artistas válidos. */
export const parseLineup = (value: unknown): LineupArtist[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string')
    .map((a) => ({
      name: String(a.name),
      time: typeof a.time === 'string' && a.time.trim() ? a.time : null,
      instagram: typeof a.instagram === 'string' ? instagramHandle(a.instagram) : null,
    }))
    .filter((a) => a.name.trim());
};

/** Lo que se guarda: sin filas vacías y con los campos recortados. */
export const cleanLineup = (artists: LineupArtist[]): LineupArtist[] =>
  artists
    .map((a) => ({
      name: a.name.trim().slice(0, 80),
      time: a.time?.trim() ? a.time.trim().slice(0, 20) : null,
      instagram: instagramHandle(a.instagram),
    }))
    .filter((a) => a.name)
    .slice(0, MAX_LINEUP);

/** Iniciales para el círculo cuando no hay foto: «DJ Martin K.» → «MK». */
export const artistInitials = (name: string) => {
  const palabras = name
    .replace(/^(dj|mc)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return (palabras.length > 1 ? palabras[0][0] + palabras[1][0] : (palabras[0] ?? '?').slice(0, 2)).toUpperCase();
};
