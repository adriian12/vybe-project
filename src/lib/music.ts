/**
 * La música de una fiesta, en cinco categorías. Las fiestas traen su género
 * tal cual lo pone cada web («Tech House», «Hard Groove», «90s - 00s»…) y el
 * filtro enseñaba más de sesenta etiquetas. Ahora: Comercial, Reggaeton,
 * Electrónica, Techno y Otras (lo que no encaja, o sin género).
 */
export const MUSICAS = ['comercial', 'reggaeton', 'electronica', 'techno', 'otras'] as const;
export type Musica = (typeof MUSICAS)[number];

/** El orden importa: «Acid Techno» es Techno antes que Electrónica, «Latin House» Electrónica antes que Reggaeton. */
const REGLAS: [Musica, RegExp][] = [
  ['techno', /techno|hard ?groove|industrial|\bebm\b|gabber|hardcore|hard ?drum|minimal/],
  [
    'electronica',
    /house|electr|\bedm\b|trance|psy|drum ?(and|&|n) ?bass|\bdnb\b|\bbass\b|breakbeat|dubstep|garage|progressive|disco|ambient|downtempo|\bidm\b|experimental|afro ?tech|jungle/,
  ],
  ['reggaeton', /reggaet|regueton|latin|dembow|perreo|guaracha|dancehall|baile ?funk|salsa|bachata|urban/],
  ['comercial', /comercial|commercial|\bhits?\b|\bpop\b|remember|petardeo|\b(80|90|00)'?s?\b|\bclub\b|internacional|joven|mainstream|top ?40/],
];

/** La categoría de un género; sin género, u otro cualquiera, «otras». */
export const musicaDe = (theme: string | null | undefined): Musica => {
  const texto = (theme ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (!texto.trim()) return 'otras';
  for (const [musica, regla] of REGLAS) if (regla.test(texto)) return musica;
  return 'otras';
};
