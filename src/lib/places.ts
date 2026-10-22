/**
 * Ciudades para el buscador del mapa: se autocompletan con Photon, el buscador
 * de lugares de OpenStreetMap hecho para ir escribiendo (Nominatim pide no
 * usarlo así). Sólo España, y sólo ciudades y pueblos: si sale en la lista, es
 * un sitio que existe.
 */

export interface Zona {
  /** Lo que se enseña: «Palma», «Madrid». */
  nombre: string;
  /** Provincia o comunidad, para distinguir dos sitios con el mismo nombre. */
  detalle: string | null;
  latitude: number;
  longitude: number;
  /** Término municipal, si Photon lo da: [sur, oeste, norte, este]. */
  limites: [number, number, number, number] | null;
}

/** España con Canarias, Ceuta y Melilla: oeste, sur, este, norte. */
const ESPANA = '-18.5,27.5,4.6,44.0';

/** Lo que se considera «de la ciudad» si Photon no da su término municipal. */
const RADIO_SIN_LIMITES_M = 15_000;
/** Margen alrededor del término: las salas de las afueras también cuentan. */
const MARGEN_GRADOS = 0.04;

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    state?: string;
    county?: string;
    countrycode?: string;
    type?: string;
    /** [oeste, norte, este, sur] */
    extent?: [number, number, number, number];
  };
}

/** Las ciudades de una respuesta de Photon, sin repetir. */
export const zonasDePhoton = (features: PhotonFeature[]): Zona[] => {
  const vistas = new Set<string>();
  const zonas: Zona[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!p.name || !c || (p.countrycode && p.countrycode !== 'ES')) continue;
    const detalle = p.county && p.county !== p.name ? p.county : p.state && p.state !== p.name ? p.state : null;
    const clave = `${p.name}|${detalle ?? ''}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    zonas.push({
      nombre: p.name,
      detalle,
      latitude: c[1],
      longitude: c[0],
      limites: p.extent ? [p.extent[3], p.extent[0], p.extent[1], p.extent[2]] : null,
    });
  }
  return zonas;
};

export const buscarCiudades = async (texto: string, signal?: AbortSignal): Promise<Zona[]> => {
  const q = texto.trim();
  if (q.length < 3) return [];
  const url =
    `https://photon.komoot.io/api/?limit=8&bbox=${ESPANA}` +
    `&layer=city&layer=locality&layer=district&q=${encodeURIComponent(q)}`;
  const respuesta = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!respuesta.ok) return [];
  const datos = (await respuesta.json()) as { features?: PhotonFeature[] };
  return zonasDePhoton(datos.features ?? []).slice(0, 5);
};

const distanciaM = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

/** Si un punto cae en la zona: dentro de su término (con margen) o cerca del centro. */
export const enZona = (zona: Zona, latitude: number, longitude: number): boolean => {
  if (zona.limites) {
    const [s, o, n, e] = zona.limites;
    return (
      latitude >= s - MARGEN_GRADOS &&
      latitude <= n + MARGEN_GRADOS &&
      longitude >= o - MARGEN_GRADOS &&
      longitude <= e + MARGEN_GRADOS
    );
  }
  return distanciaM(zona.latitude, zona.longitude, latitude, longitude) <= RADIO_SIN_LIMITES_M;
};
