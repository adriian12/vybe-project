/**
 * Avisos de caducidad en administración: Premium o plan de negocio que se acaba
 * pronto y no se va a renovar solo. Salen con una etiqueta roja para verlos de un
 * vistazo (antes sólo había un texto ámbar y, en negocios, dentro de la ficha).
 */

/** Cuántos días antes de caducar se avisa. */
export const DIAS_AVISO_CADUCIDAD = 7;

/**
 * Días que le quedan si caduca pronto sin renovación automática (0 = hoy);
 * `null` si se renueva, ya caducó o le queda más de `DIAS_AVISO_CADUCIDAD`.
 */
export const diasParaCaducar = (expiresAt: string | null | undefined, renews: boolean, ahora = Date.now()): number | null => {
  if (!expiresAt || renews) return null;
  const quedan = new Date(expiresAt).getTime() - ahora;
  if (quedan <= 0 || quedan > DIAS_AVISO_CADUCIDAD * 864e5) return null;
  return Math.floor(quedan / 864e5);
};
