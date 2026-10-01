import { supabase } from '@/integrations/supabase/client';

/**
 * Firma las URLs de los buckets privados antes de pintarlas.
 *
 * `event-photos` era público: la foto de esta noche es justo lo que más
 * protege la capa SQL —`get_nearby_profiles` no la enseña si quien mira no ha
 * puesto la suya, si la otra persona se ha ido o está invisible— pero el
 * fichero vivía en `/object/public/event-photos/…` y se descargaba sin
 * sesión, también después de que la purga debiera haberlo retirado.
 *
 * El bucket pasa a privado (migración 094). Lo que se guarda en la base de
 * datos sigue siendo la URL con forma pública: es la forma canónica, la que
 * `storagePathFromUrl()` usa para borrar y la que compara `removePhoto()`. Lo
 * único que cambia es que, para enseñarla, hay que firmarla aquí.
 */

const BUCKET = 'event-photos';
const MARCA = `/storage/v1/object/public/${BUCKET}/`;
/** Una hora: suficiente para una noche de uso sin volver a firmar a cada paso. */
const SEGUNDOS = 3600;
/** Se renueva antes de que caduque, para que no expire con la imagen puesta. */
const MARGEN_MS = 5 * 60 * 1000;

const cache = new Map<string, { firmada: string; caduca: number }>();
/** firmada -> original, para poder volver atrás al borrar o comparar. */
const inverso = new Map<string, string>();

/** La ruta dentro del bucket, o null si la URL no es de un bucket privado. */
const rutaDe = (url: string): string | null => {
  const i = url.indexOf(MARCA);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + MARCA.length).split('?')[0]);
};

/**
 * Firma las que hagan falta y devuelve `original -> firmada`. Las URLs que no
 * son del bucket privado no entran en el mapa: se pintan tal cual.
 */
export const signedPhotoMap = async (
  urls: Iterable<string | null | undefined>,
): Promise<Map<string, string>> => {
  const ahora = Date.now();
  const mapa = new Map<string, string>();
  const pendientes = new Map<string, string>(); // ruta -> original

  for (const url of urls) {
    if (!url || mapa.has(url) || pendientes.has(url)) continue;
    const ruta = rutaDe(url);
    if (!ruta) continue;

    const guardada = cache.get(url);
    if (guardada && guardada.caduca > ahora + MARGEN_MS) {
      mapa.set(url, guardada.firmada);
      continue;
    }
    pendientes.set(ruta, url);
  }

  if (pendientes.size === 0) return mapa;

  const rutas = [...pendientes.keys()];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(rutas, SEGUNDOS);

  if (error || !data) {
    // Sin firma no se pinta nada roto a medias: se deja la original, que en un
    // bucket privado dará 400, y el componente enseñará su hueco de siempre.
    console.error('No se pudieron firmar las fotos del evento:', error);
    return mapa;
  }

  for (const fila of data) {
    const original = pendientes.get(fila.path ?? '');
    if (!original || !fila.signedUrl) continue;
    cache.set(original, { firmada: fila.signedUrl, caduca: Date.now() + SEGUNDOS * 1000 });
    inverso.set(fila.signedUrl, original);
    mapa.set(original, fila.signedUrl);
  }

  return mapa;
};

/** Una sola URL, lista para pintar. */
export const signedPhotoUrl = async (url: string | null | undefined): Promise<string | undefined> => {
  if (!url) return undefined;
  const mapa = await signedPhotoMap([url]);
  return mapa.get(url) ?? url;
};

type ConFotos = { photos?: string[]; avatar?: string | null };

/**
 * Firma `photos` y `avatar` de una lista de perfiles en una sola petición.
 * Devuelve los mismos objetos, con las URLs ya listas para pintar.
 */
export const signPhotosOf = async <T extends ConFotos>(items: T[]): Promise<T[]> => {
  const todas: (string | null | undefined)[] = [];
  for (const item of items) {
    if (item.photos) todas.push(...item.photos);
    if (item.avatar) todas.push(item.avatar);
  }

  const mapa = await signedPhotoMap(todas);
  if (mapa.size === 0) return items;

  for (const item of items) {
    if (item.photos) item.photos = item.photos.map((u) => mapa.get(u) ?? u);
    if (item.avatar) item.avatar = mapa.get(item.avatar) ?? item.avatar;
  }
  return items;
};

/** Lo mismo para un solo objeto. */
export const signPhotosOfOne = async <T extends ConFotos>(item: T): Promise<T> => {
  await signPhotosOf([item]);
  return item;
};

/**
 * La forma pública canónica de una URL.
 *
 * Lo que se guarda en la base de datos es la URL pública, pero la interfaz
 * maneja la firmada: al borrar una foto o al compararla con la guardada hay
 * que volver atrás, o no coincide con nada y el fichero se queda huérfano.
 */
export const canonicalPhotoUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  const conocida = inverso.get(url);
  if (conocida) return conocida;

  // Por si la firma se hizo en otra carga de la página.
  const marcaFirma = `/storage/v1/object/sign/${BUCKET}/`;
  const i = url.indexOf(marcaFirma);
  if (i === -1) return url;
  const ruta = url.slice(i + marcaFirma.length).split('?')[0];
  return `${url.slice(0, i)}${MARCA}${ruta}`;
};

/** Al cerrar sesión: las firmas del anterior no valen para quien entre después. */
export const clearSignedPhotoCache = (): void => {
  cache.clear();
  inverso.clear();
};
