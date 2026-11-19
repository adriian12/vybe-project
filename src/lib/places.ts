/**
 * Ciudades para el buscador del mapa: se autocompletan con Photon, el buscador
 * de lugares de OpenStreetMap hecho para ir escribiendo (Nominatim pide no
 * usarlo así). Sólo España, y sólo ciudades y pueblos: si sale en la lista, es
 * un sitio que existe.
 */

import { clave } from '@/lib/scan-groups';

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

/**
 * Islas: Photon no las da como ciudad («mallorca» no devolvía Mallorca, sólo
 * pueblos con ese nombre). Límites: [sur, oeste, norte, este].
 */
export const ISLAS: Zona[] = [
  { nombre: 'Mallorca', detalle: 'Illes Balears', latitude: 39.6, longitude: 2.95, limites: [39.25, 2.3, 39.97, 3.5] },
  { nombre: 'Ibiza', detalle: 'Illes Balears', latitude: 38.98, longitude: 1.43, limites: [38.82, 1.15, 39.13, 1.62] },
  { nombre: 'Menorca', detalle: 'Illes Balears', latitude: 39.95, longitude: 4.05, limites: [39.79, 3.78, 40.1, 4.33] },
  { nombre: 'Tenerife', detalle: 'Canarias', latitude: 28.29, longitude: -16.6, limites: [27.99, -16.93, 28.6, -16.1] },
  { nombre: 'Gran Canaria', detalle: 'Canarias', latitude: 27.96, longitude: -15.6, limites: [27.73, -15.84, 28.19, -15.35] },
];

export const buscarCiudades = async (texto: string, signal?: AbortSignal): Promise<Zona[]> => {
  const q = texto.trim();
  if (q.length < 3) return [];
  const buscado = clave(q);
  const islas = ISLAS.filter((z) => clave(z.nombre).includes(buscado));
  const url =
    `https://photon.komoot.io/api/?limit=12&bbox=${ESPANA}` +
    `&layer=city&layer=locality&layer=district&q=${encodeURIComponent(q)}`;
  const respuesta = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!respuesta.ok) return islas;
  const datos = (await respuesta.json()) as { features?: PhotonFeature[] };
  // Photon corrige de más («amok» → «A Moa»): sólo las que contienen lo escrito.
  return [...islas, ...zonasDePhoton(datos.features ?? []).filter((z) => clave(z.nombre).includes(buscado))];
};

const distanciaM = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
};

/** Para sugerir un sitio sin término (urbanizaciones, barrios): fiesta a menos de esto. */
const RADIO_SUGERENCIA_M = 2_500;

/**
 * Si vale la pena sugerir la zona en el buscador: alguna fiesta dentro. Los sitios
 * sin término (Bahía Alicante, Sol de Mallorca) cogían las fiestas de la ciudad de
 * al lado con el radio de 15 km; para sugerirlos, la fiesta tiene que estar al lado.
 */
export const zonaConFiestas = (zona: Zona, puntos: { latitude: number; longitude: number }[]): boolean =>
  puntos.some((p) =>
    zona.limites
      ? enZona(zona, p.latitude, p.longitude)
      : distanciaM(zona.latitude, zona.longitude, p.latitude, p.longitude) <= RADIO_SUGERENCIA_M,
  );

const area = (z: Zona): number => (z.limites ? (z.limites[2] - z.limites[0]) * (z.limites[3] - z.limites[1]) : 0);

/**
 * Quita las sugerencias que caen dentro de otra más grande de la lista: con
 * «alicante», Alicante y no Bahía Alicante; con «mallorca», la isla y no Sol de
 * Mallorca. Palmanova no está dentro de Palma, así que con «palma» saldrían las dos.
 */
export const sinContenidas = (zonas: Zona[]): Zona[] =>
  zonas.filter(
    (b) =>
      !zonas.some((a) => {
        if (a === b || !a.limites || area(a) <= area(b)) return false;
        const [s, o, n, e] = a.limites;
        return b.latitude >= s && b.latitude <= n && b.longitude >= o && b.longitude <= e;
      }),
  );

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
