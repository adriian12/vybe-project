import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Teselas oscuras de CARTO sobre datos de OpenStreetMap. Son las mismas que usa
 * la pantalla del mapa, así que la miniatura y el mapa grande se parecen.
 */
export const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
export const TILES_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const TILE = 256;

interface MapThumbProps {
  latitude: number;
  longitude: number;
  /** Lado en píxeles de la miniatura. */
  size?: number;
  zoom?: number;
  className?: string;
}

/**
 * Un recorte de mapa con el local en el centro, sin cargar Leaflet.
 *
 * La tarjeta de «Cómo llegar» sólo necesita enseñar dónde está; montar un mapa
 * interactivo para 80 píxeles descargaba la librería entera y hasta dieciséis
 * teselas. Aquí se calculan las dos o cuatro teselas que tocan el recuadro y se
 * colocan a mano.
 */
const MapThumb: React.FC<MapThumbProps> = ({
  latitude,
  longitude,
  size = 80,
  zoom = 15,
  className,
}) => {
  const tiles = useMemo(() => {
    const n = 2 ** zoom;
    const latRad = (latitude * Math.PI) / 180;
    // Proyección de Mercator a píxeles globales del nivel de zoom.
    const gx = ((longitude + 180) / 360) * n * TILE;
    const gy = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * TILE;

    const left = gx - size / 2;
    const top = gy - size / 2;
    const lista: { key: string; src: string; x: number; y: number }[] = [];

    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size) / TILE); ty++) {
        const wrapped = ((tx % n) + n) % n;
        lista.push({
          key: `${tx}-${ty}`,
          src: `https://a.basemaps.cartocdn.com/dark_all/${zoom}/${wrapped}/${ty}@2x.png`,
          x: tx * TILE - left,
          y: ty * TILE - top,
        });
      }
    }

    return lista;
  }, [latitude, longitude, size, zoom]);

  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-xl bg-surface-high', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.src}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute max-w-none"
          style={{ left: tile.x, top: tile.y, width: TILE, height: TILE }}
        />
      ))}
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-party-primary text-ink shadow">
          <MapPin size={14} />
        </span>
      </span>
    </div>
  );
};

export default MapThumb;
