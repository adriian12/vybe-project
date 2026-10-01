/**
 * Ambiente de una fiesta según lo llena que está.
 *
 * El local da su total real desde la puerta, pero el público **nunca ve la
 * cifra**: sólo el ambiente, calculado contra el aforo. Los cortes son los de
 * `vibe_level_for()` (migración 040); si cambias uno, cambia el otro.
 */
export type VibeLevel = 'quiet' | 'lively' | 'almost_full' | 'full';

export const VIBE_LEVELS: VibeLevel[] = ['quiet', 'lively', 'almost_full', 'full'];

export const vibeLevelFor = (count: number, capacity: number | null | undefined): VibeLevel | null => {
  if (!capacity || capacity <= 0) return null;
  const ratio = count / capacity;
  if (ratio < 0.35) return 'quiet';
  if (ratio < 0.7) return 'lively';
  if (ratio < 0.95) return 'almost_full';
  return 'full';
};

export const isVibeLevel = (value: unknown): value is VibeLevel =>
  typeof value === 'string' && (VIBE_LEVELS as string[]).includes(value);

/** Clave de traducción del nivel (`vibe.levels.*`). */
export const vibeKey = (level: VibeLevel): string =>
  `vibe.levels.${level === 'almost_full' ? 'almostFull' : level}`;

/** Cuánto se llena la barra de ambiente: el tramo, no el porcentaje real. */
export const vibeFill = (level: VibeLevel): number => (VIBE_LEVELS.indexOf(level) + 1) / VIBE_LEVELS.length;
