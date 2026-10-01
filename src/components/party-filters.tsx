import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Check, ChevronDown, Clock, Music, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { FRANJAS, Franja } from '@/lib/party-filters';
import { DateMode, DateSelection, nightOf, setDateSelection, tonight, useDateSelection } from '@/lib/date-filter';

const pill = (activa: boolean) =>
  cn(
    'press flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-label-pill tracking-wide transition-colors',
    activa ? 'bg-party-primary text-ink shadow-sm' : 'bg-surface-low text-foreground',
  );

const ATAJOS: Exclude<DateMode, 'date'>[] = ['today', 'tomorrow', 'weekend', 'week'];

/** «Hoy», «Mañana», «Este finde», «Próximos 7 días» o «sáb. 27 sept.». */
// eslint-disable-next-line react-refresh/only-export-components
export const useDateLabel = () => {
  const { t } = useTranslation();
  return (sel: DateSelection) =>
    sel.mode === 'date' && sel.date
      ? new Date(`${sel.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
      : t(`filters.dates.${sel.mode}`);
};

/**
 * La fecha: atajos y un calendario en el que los días con fiestas llevan un
 * punto y los pasados no se pueden elegir. Se comparte entre inicio y mapa.
 */
export const DateFilter = ({ nights, className }: { nights: string[]; className?: string }) => {
  const { t } = useTranslation();
  const sel = useDateSelection();
  const etiqueta = useDateLabel();
  const [abierto, setAbierto] = useState(false);
  const conFiestas = useMemo(() => nights.map((n) => new Date(`${n}T12:00:00`)), [nights]);
  const hoy = new Date(`${tonight()}T00:00:00`);

  const elegir = (s: DateSelection) => {
    setDateSelection(s);
    setAbierto(false);
  };

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={cn(pill(true), className)}>
        <CalendarDays size={15} />
        <span className="first-letter:uppercase">{etiqueta(sel)}</span>
        <ChevronDown size={14} />
      </button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>{t('filters.dates.title')}</SheetTitle>
            <SheetDescription>{t('filters.dates.help')}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-wrap gap-2 py-4">
            {ATAJOS.map((m) => (
              <button key={m} type="button" onClick={() => elegir({ mode: m })} aria-pressed={sel.mode === m} className={pill(sel.mode === m)}>
                {sel.mode === m && <Check size={14} />}
                {t(`filters.dates.${m}`)}
              </button>
            ))}
          </div>
          <Calendar
            mode="single"
            weekStartsOn={1}
            selected={sel.mode === 'date' && sel.date ? new Date(`${sel.date}T12:00:00`) : undefined}
            onSelect={(d) => d && elegir({ mode: 'date', date: nightOf(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12)) })}
            disabled={{ before: hoy }}
            modifiers={{ fiestas: conFiestas }}
            modifiersClassNames={{
              fiestas:
                'relative after:absolute after:bottom-1 after:left-1/2 after:h-1.5 after:w-1.5 after:-translate-x-1/2 after:rounded-full after:bg-party-primary',
            }}
            className="mx-auto rounded-2xl bg-surface-low"
          />
        </SheetContent>
      </Sheet>
    </>
  );
};

interface PartyFiltersProps {
  /** Géneros que hay entre los eventos cargados (no una lista fija). */
  themes: string[];
  theme: string | null;
  onTheme: (theme: string | null) => void;
  franja: Franja | null;
  onFranja: (franja: Franja | null) => void;
  /** Noches con fiestas, para los puntos del calendario. */
  nights: string[];
  className?: string;
}

/**
 * Filtros de fiestas, en este orden: fecha, «Música» (todos los géneros) y
 * «Horario» (tardeo, nocheo o after, en un solo selector).
 */
const PartyFilters = ({ themes, theme, onTheme, franja, onFranja, nights, className }: PartyFiltersProps) => {
  const { t } = useTranslation();
  const [musicaAbierta, setMusicaAbierta] = useState(false);
  const [horarioAbierto, setHorarioAbierto] = useState(false);

  const borrar = (e: React.MouseEvent, accion: () => void) => {
    e.stopPropagation();
    accion();
  };

  return (
    <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
      <DateFilter nights={nights} />

      <button type="button" onClick={() => setMusicaAbierta(true)} aria-pressed={theme !== null} className={pill(theme !== null)}>
        <Music size={15} />
        {theme ?? t('filters.music')}
        {theme ? (
          <X size={14} role="button" aria-label={t('filters.clear')} onClick={(e) => borrar(e, () => onTheme(null))} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      <button type="button" onClick={() => setHorarioAbierto(true)} aria-pressed={franja !== null} className={pill(franja !== null)}>
        <Clock size={15} />
        {franja ? t(`filters.franjas.${franja}`) : t('filters.schedule')}
        {franja ? (
          <X size={14} role="button" aria-label={t('filters.clear')} onClick={(e) => borrar(e, () => onFranja(null))} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

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

      <Sheet open={horarioAbierto} onOpenChange={setHorarioAbierto}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>{t('filters.schedule')}</SheetTitle>
            <SheetDescription>{t('filters.scheduleHelp')}</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 py-4">
            {[null, ...FRANJAS].map((f) => {
              const activa = franja === f;
              return (
                <button
                  key={f ?? '__todas__'}
                  type="button"
                  onClick={() => {
                    onFranja(f);
                    setHorarioAbierto(false);
                  }}
                  aria-pressed={activa}
                  className={cn(
                    'press flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left',
                    activa ? 'bg-party-primary text-ink' : 'bg-surface-low text-foreground',
                  )}
                >
                  <span>
                    <span className="block font-bold">{f ? t(`filters.franjas.${f}`) : t('filters.allSchedules')}</span>
                    {f && <span className={cn('block text-caption', activa ? 'text-ink/70' : 'text-party-gray')}>{t(`filters.franjaHours.${f}`)}</span>}
                  </span>
                  {activa && <Check size={16} />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default PartyFilters;
