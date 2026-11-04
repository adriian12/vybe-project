import L from 'leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@maplibre/maplibre-gl-leaflet';
import { MAP_STYLE, TILES_ATTRIBUTION } from '@/components/map-thumb';

/**
 * El fondo de los mapas de Leaflet: el estilo oscuro de OpenFreeMap, pintado
 * con MapLibre como una capa más. Los alfileres, la posición y los gestos
 * siguen siendo de Leaflet, así que las pantallas no cambian.
 *
 * Antes eran las teselas de CARTO, cuyo plan gratuito no permite uso
 * comercial. OpenFreeMap sí, sin clave ni límite de visitas; sólo pide la
 * atribución.
 */
export const addBaseMap = (map: L.Map) => {
  L.maplibreGL({ style: MAP_STYLE, maxZoom: 19 }).addTo(map);
  // La capa de MapLibre no pasa su atribución al control de Leaflet.
  map.attributionControl?.addAttribution(TILES_ATTRIBUTION);
};
