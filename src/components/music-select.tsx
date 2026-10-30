import { useTranslation } from 'react-i18next';
import { MUSICAS, Musica, musicaDe } from '@/lib/music';

/**
 * Lo que se guarda en `events.theme` al elegir cada música: el nombre en
 * español, que `musicaDe()` vuelve a clasificar igual en cualquier idioma.
 */
const GUARDADO: Record<Musica, string> = {
  comercial: 'Comercial',
  reggaeton: 'Reggaeton',
  electronica: 'Electrónica',
  techno: 'Techno',
  otras: 'Otras',
};

/**
 * La música de una fiesta con las mismas cinco opciones que los filtros, para
 * que la fiesta salga en el filtro que toca. Si la fiesta ya traía un género
 * más fino («Tech House»), se enseña su categoría y no se toca mientras no se
 * cambie.
 */
const MusicSelect = ({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (theme: string) => void;
  className?: string;
}) => {
  const { t } = useTranslation();
  const actual = value.trim() ? musicaDe(value) : '';

  return (
    <select
      id={id}
      value={actual}
      onChange={(e) => onChange(e.target.value ? GUARDADO[e.target.value as Musica] : '')}
      className={className}
    >
      <option value="">{t('venue.events.musicPick')}</option>
      {MUSICAS.map((m) => (
        <option key={m} value={m}>
          {t(`filters.musicas.${m}`)}
        </option>
      ))}
    </select>
  );
};

export default MusicSelect;
