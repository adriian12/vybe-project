import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import { DARK_TILES, HAS_MAP_TILES, TILES_ATTRIBUTION } from '@/components/map-thumb';
import { getCurrentPosition } from '@/services/geo';

export interface PickedLocation {
  latitude: number;
  longitude: number;
  label?: string;
}

interface Resultado {
  lat: string;
  lon: string;
  display_name: string;
}

/** Mallorca, si no hay nada mejor por donde empezar. */
const MALLORCA: [number, number] = [39.6, 2.9];

/**
 * Dónde es el evento. Antes se tomaba la posición del móvil de quien lo creaba,
 * que casi nunca está en el local cuando lo prepara: el evento quedaba donde
 * estuviera esa persona y la geocerca no dejaba entrar a nadie.
 *
 * Se busca por dirección (OpenStreetMap, sin clave) o se usa la ubicación
 * actual, y el punto se ajusta arrastrando el marcador o tocando el mapa. La
 * búsqueda va con botón, no con cada tecla: Nominatim pide no pasar de una
 * consulta por segundo.
 */
const LocationPicker = ({
  value,
  onChange,
}: {
  value: PickedLocation | null;
  onChange: (location: PickedLocation) => void;
}) => {
  const { t, i18n } = useTranslation();
  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [localizando, setLocalizando] = useState(false);

  // El mapa, una sola vez.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const inicio: [number, number] = value ? [value.latitude, value.longitude] : MALLORCA;
    const m = L.map(contenedor.current, { zoomControl: true, attributionControl: HAS_MAP_TILES }).setView(
      inicio,
      value ? 16 : 9,
    );
    if (HAS_MAP_TILES) L.tileLayer(DARK_TILES, { attribution: TILES_ATTRIBUTION, maxZoom: 19 }).addTo(m);

    const icono = L.divIcon({
      className: '',
      html: '<div style="width:28px;height:28px;border-radius:9999px;background:#F8D000;border:3px solid #111114;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const pin = L.marker(inicio, { draggable: true, icon: icono, opacity: value ? 1 : 0 }).addTo(m);
    pin.on('dragend', () => {
      const { lat, lng } = pin.getLatLng();
      onChangeRef.current({ latitude: lat, longitude: lng });
    });
    m.on('click', (e: L.LeafletMouseEvent) => {
      pin.setLatLng(e.latlng).setOpacity(1);
      onChangeRef.current({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    });

    mapa.current = m;
    marcador.current = pin;
    // Dentro de una hoja que se abre con animación el tamaño llega tarde.
    setTimeout(() => m.invalidateSize(), 250);

    return () => {
      m.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // El valor inicial sólo sirve para abrir el mapa en su sitio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el valor cambia desde fuera (búsqueda, ubicación actual), se mueve el pin.
  useEffect(() => {
    if (!value || !mapa.current || !marcador.current) return;
    marcador.current.setLatLng([value.latitude, value.longitude]).setOpacity(1);
    mapa.current.setView([value.latitude, value.longitude], Math.max(mapa.current.getZoom(), 16));
  }, [value]);

  const buscar = async () => {
    const texto = query.trim();
    if (texto.length < 3) return;
    setBuscando(true);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=es` +
        `&accept-language=${encodeURIComponent(i18n.resolvedLanguage ?? 'es')}&q=${encodeURIComponent(texto)}`;
      const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
      setResultados(respuesta.ok ? ((await respuesta.json()) as Resultado[]) : []);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const usarActual = async () => {
    setLocalizando(true);
    try {
      const coords = await getCurrentPosition();
      onChange({ latitude: coords.latitude, longitude: coords.longitude });
    } catch {
      // Sin permiso de ubicación se puede seguir buscando por dirección.
    } finally {
      setLocalizando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void buscar();
              }
            }}
            placeholder={t('venue.events.locationSearch')}
            aria-label={t('venue.events.locationSearch')}
            className="w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-3 text-body-md text-ink shadow-sm placeholder:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
        </label>
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={buscando || query.trim().length < 3}
          className="press flex h-11 shrink-0 items-center rounded-xl bg-ink px-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {buscando ? <Loader2 size={15} className="animate-spin" /> : t('common.search')}
        </button>
      </div>

      {resultados.length > 0 && (
        <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-white">
          {resultados.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onChange({ latitude: Number(r.lat), longitude: Number(r.lon), label: r.display_name });
                  setResultados([]);
                }}
                className="press flex w-full items-start gap-2 px-3 py-2 text-left text-body-sm text-ink"
              >
                <MapPin size={14} className="mt-0.5 shrink-0" />
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={contenedor} className="h-48 w-full overflow-hidden rounded-xl bg-[#0E0E11]" />

      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-caption text-ink/70">
          {value
            ? value.label ?? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`
            : t('venue.events.locationMissing')}
        </p>
        <button
          type="button"
          onClick={() => void usarActual()}
          disabled={localizando}
          className="press flex h-8 shrink-0 items-center gap-1 rounded-lg bg-ink/10 px-2.5 text-caption font-bold text-ink"
        >
          {localizando ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
          {t('venue.events.useMyLocation')}
        </button>
      </div>
      <p className="text-caption text-ink/60">{t('venue.events.locationHelp')}</p>
    </div>
  );
};

export default LocationPicker;
