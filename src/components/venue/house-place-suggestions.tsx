import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, MapPin, X } from 'lucide-react';
import { api, HousePlace } from '@/services/api';

interface Props {
  /** Lo que lleva escrito en «Nombre del negocio». */
  query: string;
  selected: HousePlace | null;
  onSelect: (place: HousePlace | null) => void;
}

/**
 * Autocompletado del nombre en el alta de negocio con las salas de las fiestas
 * que ya tiene Fiestea. Si el negocio elige la suya, se pide quedarse con esas
 * fiestas; administración lo valida al aprobar el alta (migración 137).
 */
const HousePlaceSuggestions = ({ query, selected, onSelect }: Props) => {
  const { t } = useTranslation();
  const buscado = query.trim();
  const [places, setPlaces] = useState<HousePlace[]>([]);
  const [cerrado, setCerrado] = useState(false);
  const ultima = useRef('');

  useEffect(() => {
    setCerrado(false);
    if (selected || buscado.length < 2) {
      setPlaces([]);
      return;
    }
    ultima.current = buscado;
    const espera = window.setTimeout(() => {
      void api.searchHousePlaces(buscado).then((lista) => {
        if (ultima.current === buscado) setPlaces(lista);
      });
    }, 250);
    return () => window.clearTimeout(espera);
  }, [buscado, selected]);

  if (selected) {
    return (
      <div className="mt-2 flex items-start gap-3 rounded-xl border border-party-primary/40 bg-party-primary/10 p-3">
        <CalendarCheck size={18} className="mt-0.5 shrink-0 text-party-primary" />
        <p className="flex-1 text-body-sm text-foreground">
          {t('auth.placeClaim.linked', { count: selected.upcoming, name: selected.placeName })}
        </p>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-label={t('auth.placeClaim.unlink')}
          className="press -m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-party-gray hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  if (cerrado || places.length === 0) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-card shadow-lg" role="listbox">
      <p className="px-3 pt-2.5 text-caption text-party-gray">{t('auth.placeClaim.hint')}</p>
      <ul className="py-1">
        {places.map((place) => (
          <li key={place.placeName}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onSelect(place)}
              className="press flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5"
            >
              <MapPin size={16} className="shrink-0 text-party-gray" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-foreground">{place.placeName}</span>
                {place.city && <span className="block truncate text-caption text-party-gray">{place.city}</span>}
              </span>
              <span className="shrink-0 rounded-full bg-party-primary px-2.5 py-1 text-caption font-bold text-ink">
                {t('auth.placeClaim.events', { count: place.upcoming })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setCerrado(true)}
        className="press w-full border-t border-white/10 px-3 py-2.5 text-left text-caption font-semibold text-party-gray hover:text-foreground"
      >
        {t('auth.placeClaim.none')}
      </button>
    </div>
  );
};

export default HousePlaceSuggestions;
