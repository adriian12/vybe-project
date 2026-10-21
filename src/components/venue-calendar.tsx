import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Martini } from 'lucide-react';
import type { VenueEventSummary } from '@/services/night';
import { dayKey, groupByDay, monthCells, weekdayInitials } from '@/lib/month-calendar';
import { cn } from '@/lib/utils';

/** Lo que necesita cada fiesta del calendario. */
export type CalendarEvent = Pick<VenueEventSummary, 'id' | 'name' | 'startDate' | 'posterUrl'>;

interface VenueCalendarProps<T extends CalendarEvent> {
  /** Las próximas fiestas (del negocio o, en inicio, todas). */
  events: T[];
  /** Día tocado («2026-10-17») con sus fiestas. */
  onDay: (key: string, events: T[]) => void;
  /** A qué día va cada fiesta; por defecto, el día en que empieza. */
  dayOf?: (event: T) => string;
}

const mesDe = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/**
 * Calendario de fiestas de la ficha del negocio (y del filtro de fecha de
 * inicio y del mapa): un mes cada vez, con el cartel en cada día que tiene
 * fiesta. Con dos o más, la casilla se parte y dice cuántas hay.
 */
const VenueCalendar = <T extends CalendarEvent>({ events, onDay, dayOf }: VenueCalendarProps<T>) => {
  const { t, i18n } = useTranslation();
  const porDia = useMemo(() => groupByDay(events, dayOf), [events, dayOf]);
  const hoy = dayKey(new Date());
  const primero = mesDe(new Date());
  // Hasta el mes de la última fiesta anunciada (como poco, el actual).
  const ultimo = Math.max(primero, ...events.map((e) => mesDe(new Date(e.startDate))));
  // Abre en el mes de la próxima fiesta.
  const [mes, setMes] = useState(() =>
    events.length ? Math.max(primero, Math.min(...events.map((e) => mesDe(new Date(e.startDate))))) : primero,
  );

  const year = Math.floor(mes / 12);
  const month = mes % 12;
  const celdas = monthCells(year, month);
  const titulo = new Date(year, month, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl bg-surface-low px-2 py-1.5">
        <button
          type="button"
          onClick={() => setMes(mes - 1)}
          disabled={mes <= primero}
          aria-label={t('venuePage.prevMonth')}
          className="press flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-25"
        >
          <ArrowLeft size={18} />
        </button>
        <p className="font-display text-title-card uppercase tracking-wide" aria-live="polite">
          {titulo}
        </p>
        <button
          type="button"
          onClick={() => setMes(mes + 1)}
          disabled={mes >= ultimo}
          aria-label={t('venuePage.nextMonth')}
          className="press flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-25"
        >
          <ArrowRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2" role="grid">
        {weekdayInitials(i18n.language).map((d, i) => (
          <span key={i} className="pb-1 text-center text-caption font-bold text-party-gray">
            {d}
          </span>
        ))}

        {celdas.map((dia, i) => {
          if (!dia) return <span key={`h-${i}`} />;
          const key = dayKey(dia);
          const delDia = porDia.get(key) ?? [];
          const pasado = key < hoy;
          const conFiesta = delDia.length > 0;
          const fecha = dia.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
          return (
            <div key={key} className={cn('flex flex-col items-center gap-1', pasado && 'opacity-35')}>
              <span
                className={cn(
                  'flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1 text-body-sm font-bold tabular',
                  key === hoy && 'bg-party-primary text-ink',
                )}
              >
                {dia.getDate()}
              </span>
              <button
                type="button"
                disabled={!conFiesta}
                onClick={() => onDay(key, delDia)}
                aria-label={
                  conFiesta
                    ? `${fecha}: ${delDia.length === 1 ? delDia[0].name : t('venuePage.eventsCount', { count: delDia.length })}`
                    : `${fecha}: ${t('venuePage.noEvents')}`
                }
                className={cn(
                  'relative flex aspect-[3/4] w-full flex-col overflow-hidden rounded-lg sm:rounded-xl',
                  conFiesta ? 'press bg-surface-high ring-1 ring-white/10' : 'bg-surface-low',
                )}
              >
                {conFiesta ? (
                  <>
                    {delDia.slice(0, 2).map((e) =>
                      e.posterUrl ? (
                        <img key={e.id} src={e.posterUrl} alt="" loading="lazy" className="min-h-0 w-full flex-1 object-cover" />
                      ) : (
                        <span key={e.id} className="flex min-h-0 w-full flex-1 items-center justify-center bg-party-primary/90 text-ink">
                          <Martini size={16} />
                        </span>
                      ),
                    )}
                    {delDia.length > 1 && (
                      <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-black/70 py-0.5 text-center text-[10px] font-bold uppercase leading-tight text-white sm:py-1 sm:text-caption">
                        <span className="sm:hidden">×{delDia.length}</span>
                        <span className="hidden sm:inline">{t('venuePage.eventsCount', { count: delDia.length })}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <span className="m-auto hidden px-1 text-center text-[11px] font-semibold uppercase text-party-gray/60 sm:block">
                    {t('venuePage.noEvents')}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VenueCalendar;
