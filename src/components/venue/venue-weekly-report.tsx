import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, FileText, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PartyButton } from '@/components/ui-custom/party-button';
import { nightService, WeeklyReport } from '@/services/night';
import { cn } from '@/lib/utils';

/** «15 – 21 sep» */
const rango = (report: WeeklyReport) => {
  const desde = new Date(report.data.from);
  const hasta = new Date(new Date(report.data.to).getTime() - 1);
  const opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${desde.toLocaleDateString(undefined, opciones)} – ${hasta.toLocaleDateString(undefined, opciones)}`;
};

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/**
 * El informe de la semana del local, que se genera solo cada lunes (y la
 * primera vez que se abre el panel si aún no existe). Si hay uno sin ver, sale
 * un aviso con «Ver informe»; también se abre desde el menú.
 */
const VenueWeeklyReport = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [aviso, setAviso] = useState(false);

  const load = useCallback(async () => {
    const lista = await nightService.getWeeklyReports(8);
    setReports(lista);
    if (lista[0] && !lista[0].seenAt) setAviso(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const report = reports.find((r) => r.id === selected) ?? reports[0] ?? null;

  // Al abrir el informe se da por visto: el aviso no vuelve a salir.
  useEffect(() => {
    if (!open || !report || report.seenAt) return;
    void nightService.markReportSeen(report.id);
    setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, seenAt: new Date().toISOString() } : r)));
  }, [open, report]);

  const d = report?.data;
  const porEvento = d && d.events > 0 ? Math.round((d.check_ins / d.events) * 10) / 10 : 0;
  const cambio = d && d.check_ins_prev > 0 ? Math.round(((d.check_ins - d.check_ins_prev) / d.check_ins_prev) * 100) : null;

  const tarjetas = d
    ? [
        {
          label: t('venue.report.checkIns'),
          value: d.check_ins,
          extra:
            cambio !== null ? (
              <span className={cn('flex items-center gap-1', cambio >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                {cambio >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {t('venue.report.vsPrev', { percent: `${cambio >= 0 ? '+' : ''}${cambio}` })}
              </span>
            ) : null,
        },
        { label: t('venue.report.uniquePeople'), value: d.unique_people },
        {
          label: t('venue.report.returning'),
          value: d.returning_people,
          extra: t('venue.report.ofPeople', { percent: pct(d.returning_people, d.unique_people) }),
        },
        {
          label: t('venue.report.intents'),
          value: d.intents,
          extra: t('venue.report.arrived', { count: d.intents_arrived, percent: pct(d.intents_arrived, d.intents) }),
        },
        { label: t('venue.report.matches'), value: d.matches },
        { label: t('venue.report.events'), value: d.events },
        { label: t('venue.report.headcountPeak'), value: d.headcount_peak ?? '—' },
        {
          label: t('venue.report.promos'),
          value: d.promos_claimed,
          extra: t('venue.report.promosUsed', { count: d.promos_validated }),
        },
        { label: t('venue.report.raffles'), value: d.raffles },
        { label: t('venue.report.stampCards'), value: d.stamp_cards_completed },
        { label: t('venue.report.songs'), value: d.songs_requested },
      ]
    : [];

  return (
    <>
      <Dialog open={aviso && !open} onOpenChange={setAviso}>
        <DialogContent>
          <DialogHeader className="text-left">
            <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-party-primary text-ink">
              <FileText size={24} />
            </span>
            <DialogTitle className="font-display text-headline-md">{t('venue.report.readyTitle')}</DialogTitle>
            <DialogDescription>
              {reports[0] ? t('venue.report.readyBody', { range: rango(reports[0]) }) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <PartyButton
              className="w-full gap-2"
              onClick={() => {
                setAviso(false);
                setSelected(reports[0]?.id ?? null);
                onOpenChange(true);
              }}
            >
              <BarChart3 size={16} />
              {t('venue.report.view')}
            </PartyButton>
            <button type="button" onClick={() => setAviso(false)} className="press h-10 text-body-sm text-party-gray">
              {t('whereNext.notNow')}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="cards-light max-h-[92vh] overflow-y-auto lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:w-[520px] lg:rounded-3xl"
        >
          <SheetHeader className="mb-3 text-left">
            <SheetTitle>{t('venue.report.title')}</SheetTitle>
            <SheetDescription>{report ? rango(report) : t('venue.report.empty')}</SheetDescription>
          </SheetHeader>

          {reports.length > 1 && (
            <div className="no-scrollbar -mx-6 mb-4 flex gap-2 overflow-x-auto px-6">
              {reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelected(r.id)}
                  aria-pressed={r.id === report?.id}
                  className={cn(
                    'press h-8 shrink-0 rounded-full px-3 text-caption font-bold',
                    r.id === report?.id ? 'bg-party-primary text-ink' : 'bg-surface-high text-foreground',
                  )}
                >
                  {rango(r)}
                </button>
              ))}
            </div>
          )}

          {d && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {tarjetas.map((item) => (
                  <div key={item.label} className="surface-light rounded-2xl p-3">
                    <p className="text-caption uppercase tracking-wide text-party-gray">{item.label}</p>
                    <p className="font-display text-headline-md tabular">{item.value}</p>
                    {item.extra && <div className="text-caption text-party-gray">{item.extra}</div>}
                  </div>
                ))}
              </div>

              <ul className="surface-light space-y-2 rounded-2xl p-4 text-body-sm">
                {d.best_event && (
                  <li>{t('venue.report.bestEvent', { name: d.best_event, count: d.best_event_check_ins ?? 0 })}</li>
                )}
                {d.peak_hour !== null && <li>{t('venue.report.peakHour', { hour: String(d.peak_hour).padStart(2, '0') })}</li>}
                {d.top_code && <li>{t('venue.report.topCode', { name: d.top_code, count: d.top_code_check_ins ?? 0 })}</li>}
                {d.benchmark_check_ins_per_event !== null ? (
                  <li className="font-semibold">
                    {t('venue.report.benchmark', { mine: porEvento, others: d.benchmark_check_ins_per_event })}
                  </li>
                ) : (
                  <li className="text-party-gray">{t('venue.report.noBenchmark')}</li>
                )}
              </ul>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default VenueWeeklyReport;
