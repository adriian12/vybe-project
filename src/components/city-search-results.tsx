import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { buscarCiudades, Zona } from '@/lib/places';

/**
 * Ciudades que coinciden con lo que se escribe en el buscador del mapa. Al
 * elegir una, el mapa va allí y enseña sus fiestas (como «Palma» o «Madrid»).
 * Va encima de los negocios: buscar un sitio es lo más habitual.
 */
const CitySearchResults = ({ query, onPick }: { query: string; onPick: (zona: Zona) => void }) => {
  const { t } = useTranslation();
  const [ciudades, setCiudades] = useState<Zona[]>([]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setCiudades([]);
      return;
    }
    const control = new AbortController();
    const espera = window.setTimeout(() => {
      void buscarCiudades(query, control.signal)
        .then(setCiudades)
        .catch(() => {
          if (!control.signal.aborted) setCiudades([]);
        });
    }, 300);
    return () => {
      control.abort();
      window.clearTimeout(espera);
    };
  }, [query]);

  if (ciudades.length === 0) return null;

  return (
    <div className="pointer-events-auto overflow-hidden rounded-2xl bg-white text-ink shadow-lg shadow-black/30">
      <p className="px-4 pb-1 pt-3 text-caption font-bold uppercase tracking-wide text-ink/50">{t('map.cities')}</p>
      <ul>
        {ciudades.map((zona) => (
          <li key={`${zona.nombre}|${zona.detalle ?? ''}|${zona.latitude}`}>
            <button
              type="button"
              onClick={() => onPick(zona)}
              className="press flex w-full items-center gap-3 px-4 py-2.5 text-left"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-party-primary/20 text-[#554600]">
                <MapPin size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-title-card">{zona.nombre}</span>
                {zona.detalle && <span className="block truncate text-caption text-ink/60">{zona.detalle}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CitySearchResults;
