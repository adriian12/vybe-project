import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, ChevronRight, Coins, Loader2, Minus, Pencil, Plus, QrCode, UserPlus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import ShareLink from '@/components/team/share-link';
import { ApiError } from '@/services/api';
import { PromoterEntry, PromoterEvent, PromoterEventSummary, TeamLinkClient, TeamLinkState } from '@/services/team';
import { cn } from '@/lib/utils';

const dia = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const euros = (cents: number) =>
  (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

/**
 * RRPP con su enlace fijo: las fiestas del local y, en cada una, su lista (la
 * rellena ella), su código con QR, cuánta gente ha traído y su comisión. No ve
 * las listas de otras RRPP ni las ventas del local.
 */
const TeamPromoter = ({ client }: { client: TeamLinkClient; state: TeamLinkState }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [eventos, setEventos] = useState<PromoterEventSummary[] | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<PromoterEvent | null>(null);
  const [nombre, setNombre] = useState('');
  const [acompanantes, setAcompanantes] = useState(0);
  const [editando, setEditando] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback(
    (error: unknown) => {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    },
    [t, toast],
  );

  const cargarEventos = useCallback(async () => {
    try {
      setEventos(await client.call<PromoterEventSummary[]>('events'));
    } catch (error) {
      fail(error);
    }
  }, [client, fail]);

  const cargarDetalle = useCallback(
    async (eventId: string) => {
      try {
        setDetalle(await client.call<PromoterEvent>('event', { eventId }));
      } catch (error) {
        fail(error);
      }
    },
    [client, fail],
  );

  useEffect(() => {
    void cargarEventos();
  }, [cargarEventos]);

  useEffect(() => {
    if (!abierto) {
      setDetalle(null);
      return;
    }
    void cargarDetalle(abierto);
    // En la puerta van entrando: se refresca solo.
    const interval = setInterval(() => void cargarDetalle(abierto), 30_000);
    return () => clearInterval(interval);
  }, [abierto, cargarDetalle]);

  const limpiar = () => {
    setNombre('');
    setAcompanantes(0);
    setEditando(null);
  };

  const guardar = async () => {
    if (!abierto || !nombre.trim()) return;
    setBusy(true);
    try {
      await client.call('save_entry', {
        eventId: abierto,
        entryId: editando,
        name: nombre.trim(),
        companions: acompanantes,
      });
      limpiar();
      await cargarDetalle(abierto);
      toast({ title: t('team.promoter.saved') });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const quitar = async (entry: PromoterEntry) => {
    if (!abierto || !window.confirm(t('guestList.venue.removeConfirm', { name: entry.name }))) return;
    setBusy(true);
    try {
      await client.call('delete_entry', { eventId: abierto, entryId: entry.id });
      if (editando === entry.id) limpiar();
      await cargarDetalle(abierto);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------- una fiesta
  if (abierto) {
    const personas = detalle?.entries.reduce((n, e) => n + e.companions + 1, 0) ?? 0;
    const dentro = detalle?.entries.reduce((n, e) => n + e.admitted, 0) ?? 0;

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            setAbierto(null);
            limpiar();
            void cargarEventos();
          }}
          className="press flex items-center gap-1.5 text-body-sm font-bold text-party-gray"
        >
          <ArrowLeft size={16} />
          {t('team.promoter.back')}
        </button>

        {!detalle ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
          </div>
        ) : (
          <>
            <div>
              <h2 className="font-display text-headline-md">{detalle.event.name}</h2>
              <p className="text-body-sm text-party-gray first-letter:uppercase">{dia(detalle.event.start)}</p>
            </div>

            <div className="surface-light grid grid-cols-3 gap-2 rounded-2xl p-4 text-center">
              {[
                { label: t('team.promoter.onList'), value: personas },
                { label: t('team.promoter.inside'), value: dentro },
                { label: t('team.promoter.withCode'), value: detalle.checkIns },
              ].map((item) => (
                <div key={item.label}>
                  <p className="font-display text-headline-md tabular">{item.value}</p>
                  <p className="text-caption uppercase tracking-wide text-party-gray">{item.label}</p>
                </div>
              ))}
            </div>

            {detalle.commission && (
              <div className="surface-light flex items-center gap-3 rounded-2xl p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink">
                  <Coins size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-caption uppercase tracking-wide text-party-gray">{t('team.promoter.commissionTitle')}</p>
                  <p className="font-display text-headline-md">{euros(detalle.commission.amountCents)}</p>
                  <p className="text-caption text-party-gray">
                    {detalle.commission.type === 'per_person'
                      ? t('team.promoter.perPerson', { value: detalle.commission.value })
                      : t('team.promoter.percent', { value: detalle.commission.value })}
                  </p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-md px-2 py-0.5 text-caption font-bold',
                    detalle.commission.paidAt ? 'bg-emerald-100 text-emerald-800' : 'bg-black/[0.07] text-ink/70',
                  )}
                >
                  {t(detalle.commission.paidAt ? 'team.promoter.paid' : 'team.promoter.pendingPay')}
                </span>
              </div>
            )}

            {detalle.code && (
              <div className="surface-light rounded-2xl p-4">
                <h3 className="mb-1 flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
                  <QrCode size={17} />
                  {t('team.promoter.codeTitle')}
                </h3>
                <p className="mb-3 text-caption text-party-gray">{t('team.promoter.codeHelp')}</p>
                <p className="mb-3 text-center font-mono text-headline-lg font-black tracking-[0.3em] text-ink">
                  {detalle.code.code}
                </p>
                <ShareLink
                  value={detalle.code.code}
                  whatsappText={t('team.promoter.shareText', {
                    event: detalle.event.name,
                    code: detalle.code.code,
                    app: t('common.appName'),
                  })}
                />
              </div>
            )}

            <div className="surface-light rounded-2xl p-4">
              <h3 className="mb-3 font-display text-title-card uppercase tracking-wide">{t('team.promoter.listTitle')}</h3>

              {detalle.listOpen ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] p-2">
                  <Input
                    value={nombre}
                    maxLength={80}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void guardar()}
                    placeholder={t('guestList.venue.namePlaceholder')}
                    aria-label={t('guestList.venue.namePlaceholder')}
                    className="h-10 min-w-[10rem] flex-1"
                  />
                  <div className="flex h-10 items-center rounded-xl border border-black/10 bg-white">
                    <button type="button" aria-label="-1" onClick={() => setAcompanantes((n) => Math.max(0, n - 1))} className="press flex h-10 w-9 items-center justify-center">
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={50}
                      value={acompanantes}
                      onChange={(e) => setAcompanantes(Math.max(0, Math.min(50, Math.floor(Number(e.target.value) || 0))))}
                      aria-label={t('guestList.companions')}
                      className="h-10 w-10 bg-transparent text-center font-bold tabular outline-none"
                    />
                    <button type="button" aria-label="+1" onClick={() => setAcompanantes((n) => Math.min(50, n + 1))} className="press flex h-10 w-9 items-center justify-center">
                      <Plus size={14} />
                    </button>
                  </div>
                  {editando && (
                    <button type="button" onClick={limpiar} className="press h-10 rounded-xl px-3 text-caption font-bold">
                      {t('common.cancel')}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || !nombre.trim()}
                    onClick={() => void guardar()}
                    className="press flex h-10 items-center gap-1.5 rounded-xl bg-party-primary px-3 text-caption font-bold text-ink disabled:opacity-40"
                  >
                    <UserPlus size={14} />
                    {t(editando ? 'common.save' : 'guestList.venue.add')}
                  </button>
                </div>
              ) : (
                <p className="mb-3 rounded-xl bg-black/[0.04] p-3 text-caption text-party-gray">{t('team.promoter.listClosed')}</p>
              )}

              {detalle.entries.length === 0 ? (
                <p className="py-3 text-center text-body-sm text-party-gray">{t('team.promoter.empty')}</p>
              ) : (
                <ul className="divide-y divide-black/[0.06]">
                  {detalle.entries.map((entry) => {
                    const total = entry.companions + 1;
                    return (
                      <li key={entry.id} className={cn('flex items-center gap-3 py-2.5', editando === entry.id && 'opacity-60')}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-md font-bold">
                            {entry.name}
                            {entry.companions > 0 && <span className="ml-1 text-party-gray">+{entry.companions}</span>}
                          </p>
                          <p className={cn('text-caption', entry.admitted >= total ? 'font-bold text-emerald-700' : 'text-party-gray')}>
                            {entry.admitted >= total
                              ? t('guestList.venue.allIn', { count: total })
                              : entry.admitted > 0
                                ? t('guestList.venue.partial', { inside: entry.admitted, left: total - entry.admitted })
                                : t('guestList.venue.notYet', { count: total })}
                          </p>
                        </div>
                        {detalle.listOpen && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditando(entry.id);
                              setNombre(entry.name);
                              setAcompanantes(entry.companions);
                            }}
                            aria-label={t('team.promoter.edit')}
                            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-party-gray hover:bg-black/5"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {detalle.listOpen && entry.admitted === 0 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void quitar(entry)}
                            aria-label={t('common.delete')}
                            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-party-gray hover:text-destructive"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------- las fiestas
  if (!eventos) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  const ahora = Date.now();
  const proximas = eventos.filter((e) => new Date(e.end).getTime() > ahora);
  const pasadas = eventos.filter((e) => new Date(e.end).getTime() <= ahora).reverse();

  const fila = (e: PromoterEventSummary) => (
    <li key={e.id}>
      <button
        type="button"
        onClick={() => setAbierto(e.id)}
        className="press surface-light flex w-full items-center gap-3 rounded-2xl p-3 text-left"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/[0.06]">
          {e.posterUrl ? <img src={e.posterUrl} alt="" className="h-full w-full object-cover" /> : <CalendarDays size={20} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-md font-bold">{e.name}</span>
          <span className="block truncate text-caption text-party-gray first-letter:uppercase">{dia(e.start)}</span>
          <span className="block text-caption text-party-gray">
            {t('team.promoter.summary', { people: e.people, admitted: e.admitted, code: e.checkIns })}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-party-gray" />
      </button>
    </li>
  );

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 font-display text-headline-md">{t('team.promoter.upcoming')}</h2>
        {proximas.length === 0 ? (
          <p className="rounded-2xl bg-surface-high p-4 text-body-sm text-party-gray">{t('team.promoter.none')}</p>
        ) : (
          <ul className="space-y-2">{proximas.map(fila)}</ul>
        )}
      </section>
      {pasadas.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-headline-md">{t('team.promoter.past')}</h2>
          <ul className="space-y-2">{pasadas.map(fila)}</ul>
        </section>
      )}
    </div>
  );
};

export default TeamPromoter;
