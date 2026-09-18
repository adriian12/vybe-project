import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, Crown, DoorClosed, DoorOpen, Loader2, Plus, UserMinus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import VenueBroadcast from '@/components/venue/venue-broadcast';
import DoorCounter from '@/components/venue/door-counter';
import CounterLinks from '@/components/venue/counter-links';
import { CounterTransport } from '@/services/door-counter';
import DoorLiveInfo from '@/components/venue/door-live-info';
import VenueIntentList from '@/components/venue/venue-intent-list';
import VenueSongs from '@/components/venue/venue-songs';
import { nightService, QueueLevel } from '@/services/night';
import {
  venueService,
  CodeAttribution,
  EventOccupancy,
  VenueReport,
  VenuePlanStatus,
} from '@/services/venue-service';
import { cn } from '@/lib/utils';

interface VenueDoorProps {
  eventId: string;
  venueId: string;
  plan: VenuePlanStatus | null;
  onUpgrade: () => void;
}

const FALLBACK_AVATAR = '/placeholder.svg';

/** Color del círculo de cada tipo de código, como en la lista de Stitch. */
const COLOR_TIPO: Record<CodeAttribution['kind'], string> = {
  promoter: 'bg-[#EDE7FF] text-[#5B3FD6]',
  guest_list: 'bg-[#E3F2FF] text-[#1F6FB2]',
  staff: 'bg-[#E4F7EC] text-[#1C7A45]',
  general: 'bg-[#FFF3C4] text-[#7A5D00]',
};

const iniciales = (texto: string) =>
  texto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '·';

/** Título de tarjeta en mayúsculas, con algo opcional a la derecha. */
const Titulo: React.FC<{ children: React.ReactNode; extra?: React.ReactNode }> = ({ children, extra }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h3 className="font-display text-title-card uppercase tracking-wide">{children}</h3>
    {extra}
  </div>
);

/**
 * La puerta, según «Panel del Local (Puerta)» de Stitch: lo que el personal
 * mira toda la noche. Cuánta gente hay, cuánto queda de aforo, qué códigos
 * siguen abiertos y a quién hay que sacar.
 *
 * El aforo se refresca solo cada quince segundos. Es el dato que hoy se cuenta
 * con un clicker y que la ley obliga a controlar.
 */
const VenueDoor = ({ eventId, plan, onUpgrade }: VenueDoorProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [occupancy, setOccupancy] = useState<EventOccupancy | null>(null);
  const [codes, setCodes] = useState<CodeAttribution[]>([]);
  const [reports, setReports] = useState<VenueReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const [creando, setCreando] = useState(false);
  const [kind, setKind] = useState<'promoter' | 'guest_list' | 'staff'>('promoter');
  const [label, setLabel] = useState('');
  const [promoterName, setPromoterName] = useState('');
  const [maxUses, setMaxUses] = useState('');

  const [aforo, setAforo] = useState('');
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [noche, setNoche] = useState<{
    entryClosedAt: string | null;
    songs: boolean;
    queueLevel: QueueLevel | null;
    nowPlaying: string | null;
    price: number | null;
    ticketed: boolean;
  } | null>(null);

  const canUseCodes = plan?.promoterCodes ?? false;

  // El contador del panel habla con la base de datos con la sesión del local;
  // el del portero, con su enlace. Es el mismo componente.
  const transport = useMemo<CounterTransport>(
    () => ({
      key: `panel:${eventId}`,
      load: async () => {
        const occ = await venueService.getOccupancy(eventId);
        return {
          total: occ?.headcount ?? 0,
          capacity: occ?.capacity ?? null,
          inside: occ?.inside ?? 0,
          updatedAt: occ?.headcountAt ?? null,
        };
      },
      adjust: async (delta) => ({
        total: await venueService.adjustHeadcount(eventId, delta),
        updatedAt: new Date().toISOString(),
      }),
      set: async (total) => ({
        total: await venueService.setHeadcount(eventId, total),
        updatedAt: new Date().toISOString(),
      }),
    }),
    [eventId],
  );

  const fail = useCallback(
    (error: unknown) => {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    },
    [t, toast],
  );

  const load = useCallback(async () => {
    const [occ, attribution, rep, live] = await Promise.all([
      venueService.getOccupancy(eventId),
      venueService.getCodeAttribution(eventId),
      venueService.getReports(eventId),
      nightService.getEventLive(eventId),
    ]);
    setOccupancy(occ);
    setCodes(attribution);
    setReports(rep);
    setNoche(live);
    setIsLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const createCode = async () => {
    if (!label.trim()) return;

    if (!canUseCodes) {
      onUpgrade();
      return;
    }

    setIsBusy(true);
    try {
      const { code } = await venueService.createLabeledCode(
        eventId,
        kind,
        label.trim(),
        promoterName.trim() || undefined,
        maxUses ? Number(maxUses) : undefined,
      );
      setLabel('');
      setPromoterName('');
      setMaxUses('');
      setCreando(false);
      await load();
      toast({ title: t('venue.codes.created', { code }) });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const deactivate = async (codeId: string) => {
    setIsBusy(true);
    try {
      await venueService.deactivateCode(codeId);
      await load();
      toast({ title: t('venue.codes.deactivated') });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const revoke = async (profileId: string, name: string) => {
    setIsBusy(true);
    try {
      await venueService.revokeCheckIn(eventId, profileId);
      await load();
      toast({ title: t('venue.door.revoked', { name }) });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const guardarAforo = async () => {
    const valor = Number(aforo);
    if (!Number.isInteger(valor) || valor <= 0) return;
    setIsBusy(true);
    try {
      await venueService.setCapacity(eventId, valor, 0.9);
      setAforo('');
      await load();
      toast({ title: t('venue.door.capacitySaved') });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Cierra la puerta: ningún código deja entrar a nadie nuevo, pero quien ya
   * está dentro sigue (y puede volver a escanear). Los códigos no se tocan, así
   * que reabrir es un botón.
   */
  const cambiarPuerta = async (abrir: boolean) => {
    setConfirmarCierre(false);
    setIsBusy(true);
    try {
      const cerradaDesde = await nightService.setEntry(eventId, abrir);
      setNoche((prev) => (prev ? { ...prev, entryClosedAt: cerradaDesde } : prev));
      toast({
        title: t(abrir ? 'venue.door.reopened' : 'venue.door.closed'),
        description: abrir ? undefined : t('venue.door.closedBody'),
      });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
      </div>
    );
  }

  const ratioPercent =
    occupancy?.ratio !== null && occupancy?.ratio !== undefined ? Math.round(occupancy.ratio * 100) : null;
  const activos = codes.filter((c) => c.active);
  const cerrada = Boolean(noche?.entryClosedAt);
  const dentroAhora = occupancy?.headcount ?? occupancy?.inside ?? 0;
  const deGratis = !noche?.ticketed && (noche?.price ?? 0) <= 0;

  return (
    <div className="space-y-4 pb-24">
      {/* ------------------------------------------------------ cifras */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Dentro ahora, con el aforo: una sola barra para toda la pantalla. */}
        <div className="surface-light col-span-2 rounded-2xl p-4 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-[32px] font-extrabold leading-none tabular">{dentroAhora}</p>
            {occupancy?.capacity ? (
              <p className="text-caption text-party-gray">
                {t('venue.door.ofCapacityShort', { capacity: occupancy.capacity })}
                {ratioPercent !== null ? ` · ${ratioPercent}%` : ''}
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-caption uppercase tracking-wide text-party-gray">{t('venue.door.insideNow')}</p>
          {occupancy?.capacity ? (
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-black/[0.08]">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-500',
                  occupancy.alert ? 'bg-party-accent' : 'bg-party-primary',
                )}
                style={{ width: `${Math.min(ratioPercent ?? 0, 100)}%` }}
              />
            </div>
          ) : null}
        </div>
        <div className="surface-light rounded-2xl p-4">
          <p className="font-display text-[32px] font-extrabold leading-none tabular">
            {occupancy?.inside ?? 0}
            {occupancy?.vybeShare !== null && occupancy?.vybeShare !== undefined && (
              <span className="ml-1.5 text-body-md font-bold text-party-gray">
                {Math.round(occupancy.vybeShare * 100)}%
              </span>
            )}
          </p>
          <p className="mt-2 text-caption uppercase tracking-wide text-party-gray">{t('venue.door.insideVybe')}</p>
        </div>
        <div className="surface-light rounded-2xl p-4">
          <p className="font-display text-[32px] font-extrabold leading-none tabular">{activos.length}</p>
          <p className="mt-2 text-caption uppercase tracking-wide text-party-gray">{t('venue.door.activeCodes')}</p>
        </div>
        <div className="surface-light hidden rounded-2xl p-4 lg:block">
          <p
            className={cn(
              'font-display text-[32px] font-extrabold leading-none tabular',
              reports.length > 0 && 'text-destructive',
            )}
          >
            {reports.length}
          </p>
          <p className="mt-2 text-caption uppercase tracking-wide text-party-gray">{t('venue.door.reportsShort')}</p>
        </div>
      </div>

      {occupancy?.alert && (
        <p className="flex items-center gap-2 rounded-xl bg-party-accent px-3 py-2 text-caption font-bold text-ink">
          <AlertTriangle size={15} className="shrink-0" />
          {t('venue.door.capacityWarning')}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-5">
          {/* ---------------------------------------------------- contador */}
          <div className="surface-light rounded-2xl p-4">
            {occupancy?.capacity ? (
              <>
                <Titulo>{t('venue.counter.title')}</Titulo>
                <DoorCounter
                  transport={transport}
                  variant="panel"
                  hideSummary
                  onState={(estado) =>
                    setOccupancy((prev) =>
                      prev
                        ? {
                            ...prev,
                            headcount: estado.total,
                            headcountAt: estado.updatedAt,
                            ratio: prev.capacity ? estado.total / prev.capacity : prev.ratio,
                          }
                        : prev,
                    )
                  }
                />
                <p className="mt-3 text-caption text-party-gray">{t('venue.counter.publicNote')}</p>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-body-sm text-party-gray">{t('venue.counter.needCapacity')}</p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={aforo}
                    onChange={(e) => setAforo(e.target.value)}
                    placeholder={t('venue.door.capacityPlaceholder')}
                    aria-label={t('venue.door.capacityPlaceholder')}
                    className="h-10"
                  />
                  <PartyButton size="sm" className="h-10 shrink-0" disabled={isBusy || !aforo} onClick={() => void guardarAforo()}>
                    {t('common.save')}
                  </PartyButton>
                </div>
              </div>
            )}
          </div>

          {/* ------------------------------------------ enlaces del portero */}
          {occupancy?.capacity ? <CounterLinks eventId={eventId} /> : null}

          {/* ------------------------------------------------- termómetro */}
          <DoorLiveInfo
            eventId={eventId}
            queue={noche?.queueLevel ?? null}
            nowPlaying={noche?.nowPlaying ?? null}
            onChange={() => void load()}
          />
        </div>

        <div className="space-y-4 lg:col-span-7">
          {/* Códigos y avisos, uno al lado del otro. */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-light rounded-2xl p-4">
              <Titulo extra={<span className="text-caption text-party-gray">{t('venue.door.activeLists', { count: activos.length })}</span>}>
                {t('venue.door.activeCodesTitle')}
              </Titulo>

              {codes.length === 0 ? (
                <p className="py-2 text-body-sm text-party-gray">{t('venue.codes.empty')}</p>
              ) : (
                <ul className="divide-y divide-black/[0.06]">
                  {codes.map((row) => {
                    const nombre = row.promoterName ?? row.label ?? t('venue.codes.noLabel');
                    const tipo = t(`venue.codes.kinds.${row.kind === 'guest_list' ? 'guestList' : row.kind}`);
                    return (
                      <li key={row.codeId} className={cn('flex items-center gap-3 py-3', !row.active && 'opacity-45')}>
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-caption font-extrabold',
                            COLOR_TIPO[row.kind],
                          )}
                        >
                          {iniciales(nombre)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-md font-bold">{nombre}</p>
                          <p className="truncate text-caption text-party-gray">
                            {tipo} · <span className="font-mono tracking-wider">{row.code}</span> ·{' '}
                            {t('venue.codes.insideCount', { count: row.stillInside })}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-body-sm font-bold tabular">
                            {row.uses}
                            {row.maxUses ? `/${row.maxUses}` : ''}{' '}
                            <span className="font-normal text-party-gray">{t('venue.door.uses')}</span>
                          </p>
                          {row.active ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(row.code)}
                                aria-label={t('venue.qr.share')}
                                className="press text-party-gray hover:text-ink"
                              >
                                <Copy size={13} />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void deactivate(row.codeId)}
                                className="press text-caption text-party-gray hover:text-destructive"
                              >
                                {t('venue.codes.deactivate')}
                              </button>
                            </div>
                          ) : (
                            <p className="text-caption text-party-gray">{t('venue.codes.inactive')}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {creando ? (
                <div className="mt-3 space-y-3 rounded-xl bg-black/[0.03] p-3">
                  {!canUseCodes && (
                    <button
                      type="button"
                      onClick={onUpgrade}
                      className="press flex w-full items-center justify-center gap-2 rounded-lg bg-party-primary py-2 text-caption font-bold text-ink"
                    >
                      <Crown size={14} />
                      {t('venue.codes.needsPlan')}
                    </button>
                  )}
                  <div className="grid gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="code-kind" className="text-caption">
                        {t('venue.codes.kind')}
                      </Label>
                      <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                        <SelectTrigger id="code-kind" className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="promoter">{t('venue.codes.kinds.promoter')}</SelectItem>
                          <SelectItem value="guest_list">{t('venue.codes.kinds.guestList')}</SelectItem>
                          <SelectItem value="staff">{t('venue.codes.kinds.staff')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="code-label" className="text-caption">
                        {t('venue.codes.label')}
                      </Label>
                      <Input
                        id="code-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder={t('venue.codes.labelPlaceholder')}
                        maxLength={40}
                        className="h-10"
                      />
                    </div>
                    {kind === 'promoter' && (
                      <div className="space-y-1.5">
                        <Label htmlFor="code-promoter" className="text-caption">
                          {t('venue.codes.promoter')}
                        </Label>
                        <Input
                          id="code-promoter"
                          value={promoterName}
                          onChange={(e) => setPromoterName(e.target.value)}
                          placeholder={t('venue.codes.promoterPlaceholder')}
                          maxLength={60}
                          className="h-10"
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="code-max" className="text-caption">
                        {t('venue.codes.maxUses')}
                      </Label>
                      <Input
                        id="code-max"
                        type="number"
                        min={1}
                        value={maxUses}
                        onChange={(e) => setMaxUses(e.target.value)}
                        placeholder={t('venue.codes.maxUsesPlaceholder')}
                        className="h-10"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <PartyButton variant="outline" size="sm" className="border-black/15 text-ink" onClick={() => setCreando(false)}>
                      <X size={14} />
                      {t('common.cancel')}
                    </PartyButton>
                    <PartyButton size="sm" className="flex-1" disabled={isBusy || !label.trim()} onClick={() => void createCode()}>
                      <Plus size={14} />
                      {t('venue.codes.create')}
                    </PartyButton>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreando(true)}
                  className="press mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-black/15 text-body-sm font-bold hover:bg-black/[0.03]"
                >
                  <Plus size={16} />
                  {t('venue.door.createCode')}
                </button>
              )}
            </div>

            {/* Avisos a quien está dentro: mover gente entre salas, avisar de un
                cambio de sesión. */}
            <VenueBroadcast eventId={eventId} />
          </div>

          {/* -------------------------------------------------- denuncias */}
          {reports.length > 0 && (
            <div className="surface-light rounded-2xl p-4">
              <Titulo
                extra={<span className="text-caption font-extrabold uppercase text-destructive">{t('venue.door.priority')}</span>}
              >
                <span className="flex items-center gap-2 normal-case">
                  {t('venue.door.reportsTitle')}
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] text-white">
                    {reports.length}
                  </span>
                </span>
              </Titulo>
              <p className="-mt-2 mb-3 text-caption text-party-gray">{t('venue.door.reportsSubtitle')}</p>
              <ul className="space-y-2">
                {reports.map((report) => (
                  <li key={report.reportId} className="flex items-center gap-3 rounded-xl bg-black/[0.03] p-3">
                    <img
                      src={report.reportedPhoto || FALLBACK_AVATAR}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-md font-bold">{report.reportedName}</p>
                      <p className="truncate text-caption text-party-gray">
                        {t(`report.reasons.${report.reportType}`, { defaultValue: report.reportType })}
                        {report.reportsTotal > 1 ? ` · ${t('venue.door.reportsTotal', { count: report.reportsTotal })}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void revoke(report.reportedProfileId, report.reportedName)}
                      className="press flex h-8 shrink-0 items-center gap-1 rounded-lg border border-destructive px-2.5 text-caption font-bold text-destructive disabled:opacity-50"
                    >
                      <UserMinus size={13} />
                      {t('venue.door.revokeAccess')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ------------------------------------------------- Lista Vybe */}
          <VenueIntentList eventId={eventId} paid={!deGratis} />

          {/* -------------------------------------------------------- DJ */}
          <VenueSongs eventId={eventId} enabled={noche?.songs ?? false} onToggle={() => void load()} />
        </div>
      </div>

      {/* ------------------------------------------ puerta, siempre a mano */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-background/95 px-4 pt-3 backdrop-blur-lg">
        <div className="mx-auto mb-3 flex max-w-[1200px] items-center gap-3 lg:px-4">
          <p className={cn('min-w-0 flex-1 truncate text-body-sm', cerrada ? 'font-bold text-destructive' : 'text-party-gray')}>
            {cerrada ? t('venue.door.closedNow') : t('venue.door.openNow')}
          </p>
          {cerrada ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void cambiarPuerta(true)}
              className="press flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-party-primary px-5 font-display text-title-card text-ink disabled:opacity-40"
            >
              <DoorOpen size={18} />
              {t('venue.door.reopen')}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setConfirmarCierre(true)}
              className="press flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-destructive bg-background px-5 font-display text-title-card text-destructive disabled:opacity-40"
            >
              <DoorClosed size={18} />
              {t('venue.door.closeEntry')}
            </button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmarCierre} onOpenChange={setConfirmarCierre}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('venue.door.closeEntryTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('venue.door.closeEntryBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void cambiarPuerta(false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('venue.door.closeEntry')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VenueDoor;
