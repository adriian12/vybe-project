import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

/**
 * Fotos de la noche (`event-photos`, privado desde la migración 094) vistas
 * desde el servidor.
 *
 * En la base de datos se guarda la URL con forma pública; para enseñarla hay
 * que firmarla. El cliente con sesión lo hace él mismo (`storage-urls.ts`),
 * pero hay pantallas sin sesión (los enlaces del equipo, `team-access`) y
 * funciones que descargan la imagen (`likes-preview`): esas firman o
 * descargan aquí, con `service_role`.
 */

const BUCKET = 'event-photos';
const MARCA = `/storage/v1/object/public/${BUCKET}/`;

/** La ruta dentro del bucket, o null si la URL no es una foto de la noche. */
export const eventPhotoPath = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const i = url.indexOf(MARCA);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + MARCA.length).split('?')[0]);
};

/**
 * Recorre una respuesta (objetos, listas, textos) y cambia cada URL de una
 * foto de la noche por su versión firmada. Lo demás queda igual.
 */
export const signEventPhotosDeep = async <T>(admin: SupabaseClient, value: T, seconds = 3600): Promise<T> => {
  const rutas = new Set<string>();
  const recoger = (v: unknown) => {
    if (typeof v === 'string') {
      const ruta = eventPhotoPath(v);
      if (ruta) rutas.add(ruta);
    } else if (Array.isArray(v)) {
      v.forEach(recoger);
    } else if (v && typeof v === 'object') {
      Object.values(v as Record<string, unknown>).forEach(recoger);
    }
  };
  recoger(value);
  if (rutas.size === 0) return value;

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrls([...rutas], seconds);
  if (error || !data) {
    console.error('photo-urls: no se pudieron firmar', error);
    return value;
  }
  const firmadas = new Map<string, string>();
  for (const fila of data) if (fila.path && fila.signedUrl) firmadas.set(fila.path, fila.signedUrl);

  const cambiar = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const ruta = eventPhotoPath(v);
      return (ruta && firmadas.get(ruta)) || v;
    }
    if (Array.isArray(v)) return v.map(cambiar);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, cambiar(x)]));
    }
    return v;
  };
  return cambiar(value) as T;
};

/** Los bytes de una imagen: del bucket privado si es una foto de la noche, si no por HTTP. */
export const downloadPhoto = async (admin: SupabaseClient, url: string): Promise<Uint8Array | null> => {
  const ruta = eventPhotoPath(url);
  if (ruta) {
    const { data, error } = await admin.storage.from(BUCKET).download(ruta);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  }
  const response = await fetch(url);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
};
