import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { LineupArtist, MAX_LINEUP } from '@/lib/lineup';
import { cn } from '@/lib/utils';

interface LineupEditorProps {
  value: LineupArtist[];
  onChange: (value: LineupArtist[]) => void;
  /** Clases de los campos y de la etiqueta, para que encaje en cada formulario. */
  inputClassName: string;
  labelClassName: string;
  /** Formulario claro (panel del negocio) u oscuro (administración). */
  tone?: 'light' | 'dark';
}

/**
 * Editor del line-up (migración 105): una fila por artista con su nombre, la
 * hora (opcional) y su Instagram (opcional). Se guarda tal cual; la limpieza
 * la hace `cleanLineup` al guardar.
 */
const LineupEditor = ({ value, onChange, inputClassName, labelClassName, tone = 'light' }: LineupEditorProps) => {
  const { t } = useTranslation();
  const cambia = (i: number, campo: keyof LineupArtist, texto: string) =>
    onChange(value.map((a, k) => (k === i ? { ...a, [campo]: texto } : a)));
  const mueve = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const copia = [...value];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    onChange(copia);
  };
  const boton = cn(
    'press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-30',
    tone === 'light' ? 'bg-black/5 text-ink' : 'bg-white/10 text-foreground',
  );

  return (
    <div>
      <span className={labelClassName}>{t('venue.events.lineup')}</span>
      <p className={cn('mb-2 text-caption', tone === 'light' ? 'text-ink/60' : 'text-party-gray')}>
        {t('venue.events.lineupHelp')}
      </p>

      <ul className="space-y-3">
        {value.map((artista, i) => (
          <li
            key={i}
            className={cn('space-y-2 rounded-xl p-2.5', tone === 'light' ? 'bg-black/[0.03]' : 'bg-white/5')}
          >
            <div className="flex gap-2">
              <input
                value={artista.name}
                onChange={(e) => cambia(i, 'name', e.target.value)}
                maxLength={80}
                aria-label={t('venue.events.lineupName')}
                placeholder={t('venue.events.lineupName')}
                className={cn(inputClassName, 'min-w-0 flex-1')}
              />
              <button type="button" className={boton} onClick={() => mueve(i, -1)} disabled={i === 0} aria-label={t('venue.events.lineupUp')}>
                <ChevronUp size={16} />
              </button>
              <button
                type="button"
                className={boton}
                onClick={() => mueve(i, 1)}
                disabled={i === value.length - 1}
                aria-label={t('venue.events.lineupDown')}
              >
                <ChevronDown size={16} />
              </button>
              <button
                type="button"
                className={boton}
                onClick={() => onChange(value.filter((_, k) => k !== i))}
                aria-label={t('venue.events.lineupRemove')}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                value={artista.time ?? ''}
                onChange={(e) => cambia(i, 'time', e.target.value)}
                maxLength={20}
                aria-label={t('venue.events.lineupTime')}
                placeholder={t('venue.events.lineupTime')}
                className={cn(inputClassName, 'w-36 shrink-0')}
              />
              <input
                value={artista.instagram ?? ''}
                onChange={(e) => cambia(i, 'instagram', e.target.value)}
                maxLength={80}
                autoCapitalize="none"
                aria-label={t('venue.events.lineupInstagram')}
                placeholder={t('venue.events.lineupInstagram')}
                className={cn(inputClassName, 'min-w-0 flex-1')}
              />
            </div>
          </li>
        ))}
      </ul>

      {value.length < MAX_LINEUP && (
        <button
          type="button"
          onClick={() => onChange([...value, { name: '', time: '', instagram: '' }])}
          className={cn(
            'press mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed text-body-sm font-bold',
            tone === 'light' ? 'border-black/20 text-ink' : 'border-white/20 text-foreground',
          )}
        >
          <Plus size={15} />
          {t('venue.events.lineupAdd')}
        </button>
      )}
    </div>
  );
};

export default LineupEditor;
