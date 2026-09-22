import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Music, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { FRANJAS, Franja } from '@/lib/party-filters';

interface PartyFiltersProps {
  /** Géneros que hay entre los eventos cargados (no una lista fija). */
  themes: string[];
  theme: string | null;
  onTheme: (theme: string | null) => void;
  franja: Franja | null;
  onFranja: (franja: Franja | null) => void;
  className?: string;
}

/**
 * Filtros de fiestas: «Música» (abre todos los géneros) y las franjas Tardeo,
 * Nocheo y After. Se usan en inicio y en el mapa, con el mismo aspecto.
 */
const PartyFilters = ({ themes, theme, onTheme, franja, onFranja, className }: PartyFiltersProps) => {
  const { t } = useTranslation();
  const [musicaAbierta, setMusicaAbierta] = useState(false);

  const pill = (activa: boolean) =>
    cn(
      'press flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-label-pill tracking-wide transition-colors',
      activa ? 'bg-party-primary text-ink shadow-sm' : 'bg-surface-low text-foreground',
    );

  return (
    <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
      <button
        type="button"
        onClick={() => setMusicaAbierta(true)}
        aria-pressed={theme !== null}
        className={pill(theme !== null)}
      >
        <Music size={15} />
        {theme ?? t('filters.music')}
        {theme ? (
          <X
            size={14}
            role="button"
            aria-label={t('filters.clear')}
            onClick={(e) => {
              e.stopPropagation();
              onTheme(null);
            }}
          />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      {FRANJAS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onFranja(franja === f ? null : f)}
          aria-pressed={franja === f}
          className={pill(franja === f)}
        >
          {t(`filters.franjas.${f}`)}
        </button>
      ))}

      <Sheet open={musicaAbierta} onOpenChange={setMusicaAbierta}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>{t('filters.music')}</SheetTitle>
            <SheetDescription>{t('filters.musicHelp')}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-wrap gap-2 py-4">
            {[null, ...themes].map((nombre) => {
              const activa = theme === nombre;
              return (
                <button
                  key={nombre ?? '__todas__'}
                  type="button"
                  onClick={() => {
                    onTheme(nombre);
                    setMusicaAbierta(false);
                  }}
                  aria-pressed={activa}
                  className={pill(activa)}
                >
                  {activa && <Check size={14} />}
                  {nombre ?? t('home.allThemes')}
                </button>
              );
            })}
          </div>
          {themes.length === 0 && <p className="pb-4 text-body-sm text-party-gray">{t('filters.noMusic')}</p>}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PartyFilters;
