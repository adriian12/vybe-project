import { useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * El estilo oscuro de OpenFreeMap sobre datos de OpenStreetMap. Es el mismo que
 * usa la pantalla del mapa (`lib/base-map.ts`), así que la miniatura y el mapa
 * grande se parecen.
 *
 * OpenFreeMap es gratuito también para uso comercial, sin clave ni límite de
 * visitas; sólo pide que se vea la atribución. Sustituye a CARTO, cuyo plan
 * gratuito es sólo para uso no comercial.
 */
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
export const TILES_ATTRIBUTION =
  '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

interface MapThumbProps {
  latitude: number;
  longitude: number;
  /** Lado en píxeles de la miniatura. */
  size?: number;
  /** Zoom de Leaflet (teselas de 256 px). */
  zoom?: number;
  className?: string;
}

/**
 * Un recorte de mapa con el local en el centro, sin Leaflet ni gestos.
 *
 * La tarjeta de «Cómo llegar» sólo necesita enseñar dónde está. OpenFreeMap no
 * sirve imágenes sueltas, así que se pinta un mapa de MapLibre quieto; la
 * librería se descarga aparte, cuando la miniatura aparece, para no cargar la
 * ficha.
 */
const MapThumb: React.FC<MapThumbProps> = ({
  latitude,
  longitude,
  size = 80,
  zoom = 15,
  className,
}) => {
  const contenedor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mapa: { remove: () => void } | null = null;
    let cancelado = false;

    void import('maplibre-gl').then(({ Map }) => {
      if (cancelado || !contenedor.current) return;
      mapa = new Map({
        container: contenedor.current,
        style: MAP_STYLE,
        center: [longitude, latitude],
        // MapLibre cuenta el zoom con teselas de 512 px: uno menos que Leaflet.
        zoom: zoom - 1,
        interactive: false,
        attributionControl: false,
      });
    });

    return () => {
      cancelado = true;
      mapa?.remove();
    };
  }, [latitude, longitude, zoom]);

  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-xl bg-surface-high', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div ref={contenedor} className="absolute inset-0" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-party-primary text-ink shadow">
          <MapPin size={14} />
        </span>
      </span>
      {/* OpenFreeMap y OpenStreetMap piden que la atribución se vea. */}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 text-center text-[7px] leading-[10px] text-white/80">
        © OSM · OpenFreeMap
      </span>
    </div>
  );
};

export default MapThumb;
