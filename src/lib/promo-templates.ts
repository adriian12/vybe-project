import type { ChallengeType } from '@/services/night';

/**
 * Promociones y retos preestablecidos para la sección Promos del local.
 *
 * Un local no tiene tiempo de pensar una mecánica cada noche: estas son las que
 * funcionan en cualquier sala, listas para activar, desactivar o programar a
 * una hora. El título y la explicación salen de `venue.templates.<clave>` en el
 * idioma del panel y se guardan así en la promoción.
 *
 * Las horas de los retos se calculan sobre el evento: «entra pronto» vence una
 * hora después de abrir; «quédate hasta tarde», una hora antes de cerrar.
 */
export interface PromoTemplate {
  key: string;
  kind: 'voucher' | 'offer' | 'challenge';
  challengeType?: ChallengeType;
  challengeTarget?: number;
  /** Límite del reto, en minutos desde el inicio del evento. */
  deadlineFromStart?: number;
  /** Límite del reto, en minutos antes del final del evento. */
  deadlineBeforeEnd?: number;
  /** Cuánto dura la promoción desde que empieza, en minutos. */
  durationMinutes?: number;
  maxPerPerson?: number;
}

export const PROMO_TEMPLATES: PromoTemplate[] = [
  // ------------------------------------------------------------ promociones
  { key: 'welcomeShot', kind: 'voucher' },
  { key: 'happyHour', kind: 'offer', durationMinutes: 60 },
  { key: 'groupBottle', kind: 'offer' },
  { key: 'birthday', kind: 'voucher' },
  // ----------------------------------------------------------------- retos
  { key: 'earlyBird', kind: 'challenge', challengeType: 'early_bird', deadlineFromStart: 60 },
  { key: 'firstVybe', kind: 'challenge', challengeType: 'matches', challengeTarget: 1 },
  { key: 'threeVybes', kind: 'challenge', challengeType: 'matches', challengeTarget: 3 },
  { key: 'squad', kind: 'challenge', challengeType: 'group', challengeTarget: 4 },
  { key: 'lastOneStanding', kind: 'challenge', challengeType: 'stay_until', deadlineBeforeEnd: 60 },
  { key: 'firstVisit', kind: 'challenge', challengeType: 'first_visit' },
];

/** Hora límite del reto para un evento concreto, o undefined si no tiene. */
export const templateDeadline = (
  template: PromoTemplate,
  event: { startDate: string; endDate: string },
): string | undefined => {
  if (template.deadlineFromStart !== undefined) {
    return new Date(new Date(event.startDate).getTime() + template.deadlineFromStart * 60_000).toISOString();
  }
  if (template.deadlineBeforeEnd !== undefined) {
    return new Date(new Date(event.endDate).getTime() - template.deadlineBeforeEnd * 60_000).toISOString();
  }
  return undefined;
};
