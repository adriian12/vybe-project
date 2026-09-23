import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  BellRing,
  Heart,
  Sparkles,
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  Download,
  Lock,
  ExternalLink,
  FileText,
  HelpCircle,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MoreVertical,
  Music,
  Plus,
  QrCode,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
  DoorOpen,
  Pencil,
} from 'lucide-react';
import { useAppContext } from '@/context/app-context';
import VenueQRCode from '@/components/venue/venue-qr-code';
import CreateEventForm from '@/components/venue/create-event-form';
import VenueTeam from '@/components/venue/venue-team';
import EventFunnel from '@/components/venue/event-funnel';
import VenueDoor from '@/components/venue/venue-door';
import VenuePromotions from '@/components/venue/venue-promotions';
import VenueInsights from '@/components/venue/venue-insights';
import VenuePlan from '@/components/venue/venue-plan';
import EventPicker from '@/components/venue/event-picker';
import VenueWeeklyReport from '@/components/venue/venue-weekly-report';
import VenueProfileForm from '@/components/venue/venue-profile-form';
import { nightService } from '@/services/night';
import { BOOST_PRICE } from '@/lib/venue-plans';
import VenueSosBanner from '@/components/venue/venue-sos-banner';
import VenueDocuments from '@/components/venue/venue-documents';
import VenueBroadcast from '@/components/venue/venue-broadcast';
import LanguageSwitcher from '@/components/language-switcher';
import { VybeMark } from '@/components/brand/vybe-logo';
import { formatHourRange } from '@/components/event-bits';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/services/api';
import { openExternal } from '@/services/native';
import {
  venueService,
  EventOccupancy,
  EventSummary,
  VenuePlanStatus,
  VenueRole,
} from '@/services/venue-service';
import { cn } from '@/lib/utils';
import { COMPANY } from '@/lib/company';
import { Event as VybeEvent, VenueStats } from '@/types/venue';

/**
 * Secciones del panel.
 *
 * En el móvil son cuatro pestañas arriba (Código QR, Puerta, Eventos, Perfil) y
 * «Perfil» agrupa estadísticas, promos, equipo y plan en subpestañas; en
 * escritorio las seis van en la barra horizontal, como en los diseños de
 * escritorio de Stitch.
 */
type Section = 'qr' | 'door' | 'events' | 'stats' | 'promos' | 'team' | 'plan';
type Period = 'total' | 'year' | 'month' | 'week';
type EventFilter = 'live' | 'scheduled' | 'past';
type Drawer = null | 'menu' | 'venue' | 'documents' | 'broadcast';

const PERIODS: Period[] = ['total', 'year', 'month', 'week'];
const PROFILE_SECTIONS: Section[] = ['stats', 'promos', 'team', 'plan'];

/**
 * Lo que ve cada papel del equipo. El propietario, todo; el personal, la puerta
 * (contador, códigos, pantalla de entrada); marketing, datos y promociones. La
 * base de datos pone sus propios límites: esto sólo ordena el panel.
 */
const SECCIONES_POR_ROL: Record<VenueRole, Section[]> = {
  owner: ['qr', 'door', 'events', 'stats', 'promos', 'team', 'plan'],
  staff: ['qr', 'door'],
  marketing: ['stats', 'promos'],
};

const periodStart = (period: Period): Date | undefined => {
  if (period === 'total') return undefined;
  const since = new Date();
  if (period === 'year') since.setFullYear(since.getFullYear() - 1);
  else if (period === 'month') since.setMonth(since.getMonth() - 1);
  else since.setDate(since.getDate() - 7);
  return since;
};

const EMPTY_STATS: VenueStats = { scans: 0, activeUsers: 0, eventsCount: 0, avgAttendance: 0 };

/** Iniciales del local para el cuadrado amarillo de la cabecera. */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

const VenueDashboardPage = () => {
  const { currentVenue, logout, events, refreshEvents, venueRole } = useAppContext();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  // La sección se recuerda en la sesión del navegador: al recargar o volver de
  // otra pestaña se sigue donde estabas.
  const [section, setSection] = useState<Section>(() => {
    try {
      const guardada = window.sessionStorage.getItem('vybe_venue_section') as Section | null;
      return guardada ?? 'qr';
    } catch {
      return 'qr';
    }
  });
  const [eventoPanel, setEventoPanel] = useState<string | null>(null);
  const [editing, setEditing] = useState<VybeEvent | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem('vybe_venue_section', section);
    } catch {
      // Sin almacenamiento se vuelve al principio al recargar; no es grave.
    }
  }, [section]);
  const [statsPeriod, setStatsPeriod] = useState<Period>('total');
  const [stats, setStats] = useState<VenueStats>(EMPTY_STATS);
  const [summary, setSummary] = useState<EventSummary[]>([]);
  const [allSummary, setAllSummary] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [plan, setPlan] = useState<VenuePlanStatus | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [role, setRole] = useState<VenueRole | null>(null);
  const [occupancy, setOccupancy] = useState<EventOccupancy | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [creating, setCreating] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>('live');
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [toBoost, setToBoost] = useState<{ id: string; name: string } | null>(null);
  const [boosting, setBoosting] = useState(false);
  const [followers, setFollowers] = useState<{ total: number; lastWeek: number } | null>(null);

  // El papel en el local: el contexto lo sabe al entrar; `role` lo confirma la
  // base de datos. Mientras tanto, propietario (la cuenta del local).
  const papel: VenueRole = venueRole ?? role ?? 'owner';
  const puede = useCallback((s: Section) => SECCIONES_POR_ROL[papel].includes(s), [papel]);
  const esPropietario = papel === 'owner';
  const puedeDifundir = papel === 'owner' || papel === 'marketing';

  // Si la sección abierta no es de este papel (marketing entra en «qr»), a la
  // primera que sí lo sea.
  useEffect(() => {
    if (!puede(section)) setSection(SECCIONES_POR_ROL[papel][0]);
  }, [papel, puede, section]);

  const myEvents = useMemo(
    () => events.filter((event) => event.venueId === currentVenue?.id),
    [events, currentVenue?.id],
  );

  const liveEvent = useMemo(
    () =>
      myEvents.find(
        (event) => new Date(event.startDate) <= new Date() && new Date(event.endDate) > new Date(),
      ),
    [myEvents],
  );

  useEffect(() => {
    void venueService.getMyRole().then(setRole);
    // El plan decide qué puede hacer cada pestaña, así que se pide una vez al
    // entrar y se pasa a los componentes en lugar de que cada uno lo consulte.
    void venueService.getPlanStatus().then(setPlan);
    void nightService.getFollowersSummary().then(setFollowers);
  }, []);

  // Vuelta de Stripe tras pagar un destacado: el webhook ya lo ha marcado (o lo
  // hará en segundos), así que se avisa y se recargan los eventos.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const boost = params.get('boost');
    if (!boost) return;
    if (boost === 'success') {
      toast({ title: t('venue.boost.paid'), description: t('venue.boost.paidBody') });
      setTimeout(() => void refreshEvents(), 3000);
    }
    params.delete('boost');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [refreshEvents, t, toast]);

  const avisarSeguidores = async (eventId: string) => {
    try {
      const enviado = await nightService.notifyFollowers(eventId);
      toast({
        title: enviado ? t('venue.followers.notified') : t('venue.followers.alreadyNotified'),
        description: enviado ? t('venue.followers.notifiedBody', { count: followers?.total ?? 0 }) : undefined,
      });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const destacar = async () => {
    if (!toBoost) return;
    setBoosting(true);
    try {
      const url = await nightService.startBoostCheckout(toBoost.id);
      if (!url) {
        toast({ title: t('venue.plan.notConfigured'), variant: 'destructive' });
        setToBoost(null);
        return;
      }
      window.location.href = url;
    } catch {
      toast({ title: t('common.error'), description: t('venue.plan.checkoutFailed'), variant: 'destructive' });
    } finally {
      setBoosting(false);
    }
  };

  /** Las estadísticas vienen de get_venue_stats(); antes eran Math.random(). */
  const loadStats = useCallback(async () => {
    if (!currentVenue) return;

    setIsLoadingStats(true);
    try {
      const since = periodStart(statsPeriod);
      const [venueStats, rows] = await Promise.all([
        api.getVenueStats(currentVenue.id, since),
        venueService.getEventsSummary(currentVenue.id, since),
      ]);
      setStats(venueStats);
      setSummary(rows);
      setSelectedEventId((prev) => prev ?? rows[0]?.eventId ?? null);
    } catch (error) {
      console.error('Error loading venue stats:', error);
      setStats(EMPTY_STATS);
    } finally {
      setIsLoadingStats(false);
    }
  }, [currentVenue, statsPeriod]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Todos los eventos con sus cifras, para la lista de eventos: de ahí salen
  // los pasados y cuánta gente dijo que iba a cada uno.
  const loadAllSummary = useCallback(async () => {
    if (!currentVenue) return;
    setAllSummary(await venueService.getEventsSummary(currentVenue.id));
  }, [currentVenue]);

  useEffect(() => {
    void loadAllSummary();
  }, [loadAllSummary]);

  // Aforo del evento en directo, para la franja de arriba.
  useEffect(() => {
    if (!liveEvent) {
      setOccupancy(null);
      return;
    }
    let vivo = true;
    const leer = () =>
      venueService.getOccupancy(liveEvent.id).then((occ) => {
        if (vivo) setOccupancy(occ);
      });
    void leer();
    const reloj = setInterval(() => void leer(), 30_000);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [liveEvent]);

  const handleDeleteEvent = async () => {
    if (!toDelete) return;
    const { id } = toDelete;
    setToDelete(null);
    try {
      await api.deleteEvent(id);
      await Promise.all([refreshEvents(), loadAllSummary()]);
      toast({ title: t('venue.events.deleted') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  // Exportar: CSV y PDF son de Business. En los demás planes el botón lleva
  // a la comparativa de planes.
  const puedeExportar = plan?.plan === 'business';

  const cabecerasResumen = () => ({
    eventId: 'id',
    eventName: t('venue.events.name'),
    startDate: t('venue.events.startDate'),
    endDate: t('venue.events.endDate'),
    intents: t('venue.stats.funnelIntents'),
    checkIns: t('venue.stats.funnelCheckIns'),
    swipes: t('venue.stats.funnelSwipers'),
    matches: t('venue.stats.funnelMatches'),
    bookingClicks: t('venue.stats.funnelBookings'),
  });

  const exportPdf = () => {
    if (!puedeExportar) {
      goTo('plan');
      return;
    }
    const ok = venueService.exportSummaryPdf(summary, cabecerasResumen(), {
      title: t('venue.stats.pdfTitle'),
      venueName: currentVenue?.name ?? '',
      brand: t('common.appName'),
    });
    if (!ok) toast({ title: t('venue.stats.popupBlocked'), variant: 'destructive' });
  };

  const exportCsv = () => {
    if (!puedeExportar) {
      goTo('plan');
      return;
    }
    venueService.exportSummaryCsv(summary, {
      eventId: 'id',
      eventName: t('venue.events.name'),
      startDate: t('venue.events.startDate'),
      endDate: t('venue.events.endDate'),
      intents: t('venue.stats.funnelIntents'),
      checkIns: t('venue.stats.funnelCheckIns'),
      swipes: t('venue.stats.funnelSwipers'),
      matches: t('venue.stats.funnelMatches'),
      bookingClicks: t('venue.stats.funnelBookings'),
    });
    toast({ title: t('venue.stats.exported') });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  if (!currentVenue) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  const goTo = (next: Section) => {
    setSection(next);
    setDrawer(null);
    window.scrollTo({ top: 0 });
  };

  // El evento sobre el que trabajan puerta, promociones y datos: el que está en
  // marcha, o el primero de la lista.
  const eventosAbiertos = [...myEvents]
    .filter((event) => new Date(event.endDate).getTime() > Date.now())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const workingEventId =
    (eventoPanel && eventosAbiertos.some((event) => event.id === eventoPanel) ? eventoPanel : null) ??
    liveEvent?.id ??
    eventosAbiertos[0]?.id ??
    selectedEventId ??
    null;
  const workingEvent = myEvents.find((event) => event.id === workingEventId) ?? null;
  const picker = <EventPicker events={eventosAbiertos} value={workingEventId} onChange={setEventoPanel} />;
  const esPerfil = PROFILE_SECTIONS.includes(section);
  const nombrePlan = plan ? t(`venue.plan.names.${plan.plan}`) : null;
  const primeraDePerfil = PROFILE_SECTIONS.find(puede);

  const mobileTabs = [
    { key: 'qr', label: t('venue.tabs.qr'), active: section === 'qr', go: () => goTo('qr'), show: puede('qr') },
    { key: 'door', label: t('venue.tabs.door'), active: section === 'door', go: () => goTo('door'), show: puede('door') },
    {
      key: 'events',
      label: t('venue.tabs.events'),
      active: section === 'events',
      go: () => goTo('events'),
      show: puede('events'),
    },
    {
      key: 'profile',
      label: t('venue.tabs.profile'),
      active: esPerfil,
      go: () => goTo(esPerfil ? section : (primeraDePerfil ?? 'stats')),
      show: Boolean(primeraDePerfil),
    },
  ].filter((tab) => tab.show);

  const desktopTabs = (
    [
      { section: 'qr', label: t('venue.nav.qr'), icon: QrCode },
      { section: 'door', label: t('venue.nav.door'), icon: DoorOpen },
      { section: 'events', label: t('venue.nav.events'), icon: CalendarDays },
      { section: 'stats', label: t('venue.nav.stats'), icon: BarChart3 },
      { section: 'promos', label: t('venue.nav.promos'), icon: Tag },
      { section: 'team', label: t('venue.tabs.team'), icon: Users },
      { section: 'plan', label: t('venue.nav.plan'), icon: CreditCard },
    ] as { section: Section; label: string; icon: typeof QrCode; also?: Section[] }[]
  ).filter((tab) => puede(tab.section));

  const profileTabs = (
    [
      { section: 'stats', label: t('venue.tabs.stats') },
      { section: 'promos', label: t('venue.tabs.promos') },
      { section: 'team', label: t('venue.tabs.team') },
      { section: 'plan', label: t('venue.tabs.plan') },
    ] as { section: Section; label: string }[]
  ).filter((tab) => puede(tab.section));

  // ---------------------------------------------------------------- eventos
  const ahora = Date.now();
  const intencionesDe = (id: string) => allSummary.find((row) => row.eventId === id);
  const listaEventos =
    eventFilter === 'past'
      ? allSummary
          .filter((row) => new Date(row.endDate).getTime() <= ahora)
          .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
          .map((row) => ({
            id: row.eventId,
            name: row.eventName,
            startDate: row.startDate,
            endDate: row.endDate,
            posterUrl: undefined as string | undefined,
            bookingUrl: undefined as string | undefined,
            featured: false,
            count: row.checkIns,
          }))
      : myEvents
          .filter((event) => {
            const start = new Date(event.startDate).getTime();
            return eventFilter === 'live' ? start <= ahora : start > ahora;
          })
          .map((event) => ({
            id: event.id,
            name: event.name,
            startDate: event.startDate,
            endDate: event.endDate,
            posterUrl: event.posterUrl,
            bookingUrl: event.bookingUrl,
            featured: Boolean(event.featuredUntil && new Date(event.featuredUntil).getTime() > ahora),
            count: intencionesDe(event.id)?.intents ?? 0,
          }));

  // ------------------------------------------------------------ piezas
  const franjaDirecto = (
    <div className="flex items-center justify-between gap-3 text-body-sm">
      {liveEvent ? (
        <span className="flex min-w-0 items-center gap-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="truncate font-bold">{liveEvent.name}</span>
          <span className="shrink-0 text-emerald-400">· {t('venue.live')}</span>
        </span>
      ) : (
        <span className="flex items-center gap-2 text-party-gray">
          <span className="h-2.5 w-2.5 rounded-full bg-surface-highest" />
          {t('venue.noLive')}
        </span>
      )}
      {occupancy && (
        <span className="shrink-0 font-display text-title-card">
          <span className="mr-1 text-caption uppercase text-party-gray">{t('venue.capacity')}</span>
          <span className={occupancy.alert ? 'text-party-accent' : 'text-party-primary'}>
            {occupancy.headcount ?? occupancy.inside}
            {occupancy.capacity ? `/${occupancy.capacity}` : ''}
          </span>
        </span>
      )}
    </div>
  );

  const selectorEvento = summary.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={selectedEventId ?? undefined} onValueChange={setSelectedEventId}>
        <SelectTrigger className="h-10 min-w-0 flex-1 lg:max-w-sm">
          <SelectValue placeholder={t('venue.stats.selectEvent')} />
        </SelectTrigger>
        <SelectContent>
          {summary.map((row) => (
            <SelectItem key={row.eventId} value={row.eventId}>
              {row.eventName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <PartyButton variant="outline" size="sm" onClick={exportCsv} className="h-10">
        {puedeExportar ? <Download size={14} /> : <Lock size={14} />}
        {t('venue.stats.exportCsv')}
      </PartyButton>
      <PartyButton variant="outline" size="sm" onClick={exportPdf} className="h-10">
        {puedeExportar ? <FileText size={14} /> : <Lock size={14} />}
        {t('venue.stats.exportPdf')}
      </PartyButton>
      {!puedeExportar && <span className="text-caption text-party-gray">{t('venue.stats.exportBusiness')}</span>}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ======================================================= cabecera */}
      <header className="pt-safe sticky top-0 z-30 bg-card">
        {/* ---- móvil ---- */}
        <div className="flex h-16 items-center justify-between gap-3 px-4 lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-party-primary font-display text-sm font-black text-ink">
              {iniciales(currentVenue.name)}
            </span>
            <span className="truncate font-display text-title-card">{currentVenue.name}</span>
            {nombrePlan && (
              <span className="shrink-0 rounded-full bg-party-primary px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                {plan?.status === 'trialing' ? t('venue.planChipTrial', { plan: nombrePlan }) : t('venue.planChip', { plan: nombrePlan })}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {puedeDifundir && (
              <button
                type="button"
                onClick={() => setDrawer('broadcast')}
                aria-label={t('venue.broadcast.title')}
                className="press flex h-9 w-9 items-center justify-center rounded-full bg-surface-high"
              >
                <Megaphone size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setDrawer('menu')}
              aria-label={t('venue.menu')}
              className="press flex h-9 w-9 items-center justify-center rounded-full bg-surface-high"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>

        {/* ---- escritorio ---- */}
        <div className="hidden h-16 items-center justify-between gap-6 border-b border-white/[0.06] px-6 lg:flex">
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex items-center gap-2.5">
              <VybeMark size={34} />
              <div className="leading-tight">
                <p className="flex items-center gap-2 font-display text-headline-md">
                  Fiestea
                  <span className="rounded bg-party-primary px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                    Venue Suite
                  </span>
                </p>
                <p className="text-caption text-party-gray">{t('venue.suiteTagline')}</p>
              </div>
            </div>
            <span className="h-8 w-px bg-white/10" />
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-display text-title-card">
                {currentVenue.name}
                {currentVenue.city ? ` · ${currentVenue.city}` : ''}
              </span>
              {nombrePlan && (
                <span className="rounded-full bg-party-primary px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                  {plan?.status === 'trialing' ? t('venue.planChipTrial', { plan: nombrePlan }) : t('venue.planChip', { plan: nombrePlan })}
                </span>
              )}
            </div>
            <div className="min-w-0 rounded-full bg-surface px-3 py-1.5">{franjaDirecto}</div>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {puedeDifundir && (
              <button
                type="button"
                onClick={() => setDrawer('broadcast')}
                className="press flex h-9 items-center gap-2 rounded-full bg-surface-high px-3 text-caption"
              >
                <Megaphone size={15} className="text-party-primary" />
                {t('venue.broadcastShort')}
              </button>
            )}
            <div className="text-right leading-tight">
              <p className="font-display text-title-card">{currentVenue.email}</p>
              <p className="text-caption text-party-gray">
                {role ? t(`venue.team.roles.${role}`) : t('venue.myVenue')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrawer('menu')}
              aria-label={t('venue.menu')}
              className="press flex h-10 w-10 items-center justify-center rounded-full bg-party-primary text-ink"
            >
              <Menu size={18} />
            </button>
          </div>
        </div>

        {/* ---- pestañas ---- */}
        <nav className="grid auto-cols-fr grid-flow-col gap-1 px-3 pb-2 lg:hidden">
          {mobileTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={tab.go}
              aria-current={tab.active ? 'page' : undefined}
              className={cn(
                'press h-9 rounded-lg text-caption font-bold',
                tab.active ? 'bg-party-primary text-ink' : 'text-party-gray',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <nav className="no-scrollbar hidden gap-1 overflow-x-auto px-6 py-2 lg:flex">
          {desktopTabs.map((tab) => {
            const activa = section === tab.section || tab.also?.includes(section);
            return (
              <button
                key={tab.section}
                type="button"
                onClick={() => goTo(tab.section)}
                aria-current={activa ? 'page' : undefined}
                className={cn(
                  'press flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-body-sm font-semibold',
                  activa ? 'bg-party-primary text-ink' : 'text-[#C8C6C5] hover:bg-white/[0.04]',
                )}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] px-4 py-2 lg:hidden">{franjaDirecto}</div>

        {esPerfil && (
          <nav className="grid auto-cols-fr grid-flow-col border-t border-white/[0.06] lg:hidden">
            {profileTabs.map((tab) => (
              <button
                key={tab.section}
                type="button"
                onClick={() => goTo(tab.section)}
                aria-current={section === tab.section ? 'page' : undefined}
                className={cn(
                  'press h-10 border-b-2 text-caption font-bold',
                  section === tab.section ? 'border-party-primary text-foreground' : 'border-transparent text-party-gray',
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* ======================================================= contenido */}
      <main className="cards-light mx-auto max-w-[1200px] space-y-4 overflow-x-hidden px-4 pb-28 pt-4 lg:px-8 lg:pt-6">
        {!currentVenue.isVerified && (
          <div className="flex gap-3 rounded-2xl bg-destructive/15 p-4">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-display text-title-card">{t('venue.pendingTitle')}</p>
              <p className="text-body-sm text-party-gray">{t('venue.pendingBody')}</p>
            </div>
          </div>
        )}

        {/* Una emergencia no puede estar escondida en una pestaña. */}
        <VenueSosBanner />

        {/* ------------------------------------------------------------ QR */}
        {section === 'qr' && (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="space-y-3 lg:col-span-12">{picker}</div>
            <div className="lg:col-span-7">
              <VenueQRCode eventId={workingEventId} onCodeGenerated={loadStats} />
            </div>
            <div className="space-y-4 lg:col-span-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="surface-light rounded-2xl p-4">
                  <p className="text-caption uppercase tracking-wide text-party-gray">{t('venue.stats.checkIns')}</p>
                  <p className="font-display text-headline-xl tabular">{isLoadingStats ? '—' : stats.scans}</p>
                </div>
                <div className="surface-light rounded-2xl p-4">
                  <p className="text-caption uppercase tracking-wide text-party-gray">{t('venue.stats.activeUsers')}</p>
                  <p className="font-display text-headline-xl tabular">{isLoadingStats ? '—' : stats.activeUsers}</p>
                </div>
              </div>
              <ConfigCard />
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- puerta */}
        {section === 'door' && picker}
        {section === 'door' &&
          (workingEventId ? (
            <VenueDoor
              key={workingEventId}
              eventId={workingEventId}
              venueId={currentVenue.id}
              plan={plan}
              onUpgrade={() => goTo('plan')}
            />
          ) : (
            <Vacio icon={DoorOpen} text={t('venue.door.noEvent')} action={() => goTo('events')} actionLabel={t('venue.events.newEvent')} />
          ))}

        {/* -------------------------------------------------------- eventos */}
        {section === 'events' && (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-7">
              <div className="flex items-center justify-between gap-3">
                <h1 className="font-display text-headline-lg lg:text-headline-xl">{t('venue.events.title')}</h1>
                <PartyButton className="hidden lg:inline-flex" onClick={() => setCreating(true)}>
                  <Plus size={16} />
                  {t('venue.events.generate')}
                </PartyButton>
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-xl bg-card p-1">
                {(['live', 'scheduled', 'past'] as const).map((filtro) => (
                  <button
                    key={filtro}
                    type="button"
                    onClick={() => setEventFilter(filtro)}
                    aria-pressed={eventFilter === filtro}
                    className={cn(
                      'press h-9 rounded-lg text-caption font-bold',
                      eventFilter === filtro ? 'bg-party-primary text-ink' : 'text-party-gray',
                    )}
                  >
                    {t(`venue.events.filters.${filtro}`)}
                  </button>
                ))}
              </div>

              {listaEventos.length === 0 ? (
                <Vacio icon={CalendarDays} text={t(`venue.events.empty.${eventFilter}`)} />
              ) : (
                <ul className="stagger space-y-3">
                  {listaEventos.map((event, index) => {
                    const directo =
                      new Date(event.startDate).getTime() <= ahora && new Date(event.endDate).getTime() > ahora;
                    const acabado = new Date(event.endDate).getTime() <= ahora;
                    const fecha = new Date(event.startDate).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    });

                    const editable = !acabado ? myEvents.find((e) => e.id === event.id) : undefined;
                    return (
                      <li
                        key={event.id}
                        style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
                        onClick={editable ? () => setEditing(editable) : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-2xl p-3',
                          acabado ? 'bg-[#C8C6C5] text-ink/70' : 'cursor-pointer bg-white text-ink hover:bg-white/90',
                        )}
                      >
                        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#EDEBFA]">
                          {event.posterUrl ? (
                            <img src={event.posterUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Music size={20} className="text-ink/30" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            <span className="max-w-full truncate font-display text-title-card">{event.name}</span>
                            {event.featured && (
                              <span className="flex shrink-0 items-center gap-0.5 rounded-md bg-party-accent px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-white">
                                <Sparkles size={10} />
                                {t('venue.boost.badge')}
                              </span>
                            )}
                          </p>
                          <p className="truncate text-body-sm text-ink/55">
                            {fecha} · {formatHourRange(event.startDate, event.endDate)}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-caption text-ink/60">
                            <Users size={13} />
                            {acabado
                              ? t('venue.events.cameIn', { count: event.count })
                              : t('venue.events.going', { count: event.count })}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span
                            className={cn(
                              'rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase',
                              directo ? 'bg-party-primary text-ink' : 'bg-black/[0.07] text-ink/70',
                            )}
                          >
                            {t(`venue.events.status.${directo ? 'live' : acabado ? 'past' : 'scheduled'}`)}
                          </span>
                          {!acabado && (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                onClick={(e) => e.stopPropagation()}
                                aria-label={t('venue.events.options')}
                                className="press flex h-7 w-7 items-center justify-center rounded-full text-ink/50 hover:bg-black/5"
                              >
                                <MoreVertical size={17} />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                {editable && (
                                  <DropdownMenuItem onClick={() => setEditing(editable)}>
                                    <Pencil size={15} className="mr-2" />
                                    {t('common.edit')}
                                  </DropdownMenuItem>
                                )}
                                {puedeDifundir && (
                                  <DropdownMenuItem onClick={() => void avisarSeguidores(event.id)}>
                                    <BellRing size={15} className="mr-2" />
                                    {t('venue.followers.notify')}
                                  </DropdownMenuItem>
                                )}
                                {puedeDifundir && !event.featured && (
                                  <DropdownMenuItem onClick={() => setToBoost({ id: event.id, name: event.name })}>
                                    <Sparkles size={15} className="mr-2" />
                                    {t('venue.boost.action', { price: BOOST_PRICE })}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => goTo('stats')}>
                                  <BarChart3 size={15} className="mr-2" />
                                  {t('venue.tabs.stats')}
                                </DropdownMenuItem>
                                {event.bookingUrl && (
                                  <DropdownMenuItem onClick={() => void openExternal(event.bookingUrl as string)}>
                                    <ExternalLink size={15} className="mr-2" />
                                    {t('venue.events.bookings')}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => setToDelete({ id: event.id, name: event.name })}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 size={15} className="mr-2" />
                                  {t('common.delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* En escritorio el formulario vive al lado de la lista; en el móvil
                se abre desde el botón flotante. */}
            <aside className="hidden lg:col-span-5 lg:block">
              <div className="sticky top-40">
                <CreateEventForm onCreated={() => void loadAllSummary()} />
              </div>
            </aside>

            <button
              type="button"
              onClick={() => setCreating(true)}
              className="press fixed inset-x-4 bottom-4 z-20 flex h-14 items-center justify-center gap-2 rounded-2xl bg-party-primary font-display text-title-card text-ink shadow-[0_8px_24px_rgba(0,0,0,0.5)] pb-safe lg:hidden"
            >
              <Plus size={18} />
              {t('venue.events.generate')}
            </button>
          </div>
        )}

        {/* -------------------------------------------------- estadísticas */}
        {section === 'stats' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="hidden font-display text-headline-xl lg:block">{t('venue.stats.title')}</h1>
              <div className="flex items-center gap-2">
                <span className="text-body-sm text-party-gray">{t('venue.stats.period')}</span>
                {PERIODS.map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setStatsPeriod(period)}
                    aria-pressed={statsPeriod === period}
                    className={cn(
                      'press h-8 rounded-full px-3 text-caption font-bold',
                      statsPeriod === period ? 'bg-party-primary text-ink' : 'bg-card text-[#C8C6C5]',
                    )}
                  >
                    {t(`venue.stats.periods.${period}`)}
                  </button>
                ))}
              </div>
            </div>

            {isLoadingStats ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    { label: t('venue.stats.totalCheckIns'), value: stats.scans },
                    { label: t('venue.stats.activeUsers'), value: stats.activeUsers },
                    { label: t('venue.stats.eventsCreated'), value: stats.eventsCount },
                    { label: t('venue.stats.avgAttendance'), value: stats.avgAttendance },
                  ].map((item) => (
                    <div key={item.label} className="surface-light rounded-2xl p-4">
                      <p className="text-caption uppercase tracking-wide text-party-gray">{item.label}</p>
                      <p className="font-display text-headline-xl tabular">{item.value}</p>
                    </div>
                  ))}
                </div>

                {followers && (
                  <div className="surface-light flex items-center gap-4 rounded-2xl p-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink">
                      <Heart size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-caption uppercase tracking-wide text-party-gray">{t('venue.followers.title')}</p>
                      <p className="font-display text-headline-lg tabular">
                        {followers.total}
                        {followers.lastWeek > 0 && (
                          <span className="ml-2 text-body-sm font-bold text-emerald-600">
                            {t('venue.followers.thisWeek', { count: followers.lastWeek })}
                          </span>
                        )}
                      </p>
                      <p className="text-caption text-party-gray">{t('venue.followers.hint')}</p>
                    </div>
                  </div>
                )}

                {summary.length > 0 ? (
                  <>
                    {selectorEvento}
                    {/* Embudo por evento: un local paga por saber a qué hora se llena. */}
                    {selectedEventId && (
                      <div className="grid gap-4 lg:grid-cols-12">
                        <div className="lg:col-span-12">
                          <EventFunnel eventId={selectedEventId} />
                        </div>
                      </div>
                    )}
                    {selectedEventId && (
                      <VenueInsights
                        eventId={selectedEventId}
                        venueId={currentVenue.id}
                        plan={plan}
                        onUpgrade={() => goTo('plan')}
                      />
                    )}
                  </>
                ) : (
                  <Vacio icon={BarChart3} text={t('venue.stats.empty')} />
                )}
              </>
            )}
          </div>
        )}

        {/* ------------------------------------------------ promos y equipo */}
        {section === 'promos' && (
          <div className="space-y-4">
            {picker}
            {workingEvent ? (
              <VenuePromotions
                key={workingEvent.id}
                event={workingEvent}
                venueId={currentVenue.id}
                plan={plan}
                onUpgrade={() => goTo('plan')}
              />
            ) : (
              <Vacio icon={Tag} text={t('venue.door.noEvent')} />
            )}
          </div>
        )}

        {section === 'team' && (
          <div className="mx-auto max-w-2xl">
            <VenueTeam venueId={currentVenue.id} role={role} />
          </div>
        )}

        {section === 'plan' && <VenuePlan plan={plan} onUpgrade={() => goTo('plan')} />}
      </main>

      {/* ============================================ panel lateral y hojas */}
      <Sheet open={drawer === 'menu'} onOpenChange={(open) => setDrawer(open ? 'menu' : null)}>
        <SheetContent side="left" className="flex w-[280px] flex-col bg-card p-0 sm:max-w-[280px]">
          <SheetHeader className="flex-row items-center gap-3 space-y-0 border-b border-white/[0.06] p-5 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-party-primary font-display font-black text-ink">
              {iniciales(currentVenue.name)}
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-title-card">{currentVenue.name}</SheetTitle>
              <SheetDescription className="truncate text-caption">{currentVenue.email}</SheetDescription>
            </div>
          </SheetHeader>

          <nav className="flex-1 space-y-1 p-3">
            {[
              { icon: Building2, label: t('venue.myVenue'), onClick: () => setDrawer('venue'), show: esPropietario },
              {
                icon: FileText,
                label: t('venue.drawer.documents'),
                onClick: () => setDrawer('documents'),
                show: esPropietario,
              },
              { icon: CreditCard, label: t('venue.drawer.billing'), onClick: () => goTo('plan'), show: esPropietario },
              {
                icon: FileText,
                label: t('venue.report.title'),
                onClick: () => {
                  setDrawer(null);
                  setReportOpen(true);
                },
                show: puedeDifundir,
              },
              {
                icon: Megaphone,
                label: t('venue.drawer.broadcast'),
                onClick: () => setDrawer('broadcast'),
                show: puedeDifundir,
              },
              {
                icon: HelpCircle,
                label: t('venue.drawer.help'),
                onClick: () =>
                  void openExternal(
                    `mailto:${COMPANY.email}?subject=${encodeURIComponent(`Fiestea · ${currentVenue.name}`)}`,
                  ),
                show: true,
              },
            ]
              .filter((item) => item.show)
              .map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="press flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-body-md text-[#C8C6C5] hover:bg-surface-high hover:text-foreground"
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
            <div className="flex items-center justify-between rounded-xl px-3 py-2 text-body-md text-[#C8C6C5]">
              {t('common.language')}
              <LanguageSwitcher />
            </div>
          </nav>

          <div className="border-t border-white/[0.06] p-3">
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="press flex h-12 w-full items-center gap-3 rounded-xl px-3 text-body-md font-semibold text-destructive hover:bg-destructive/10"
            >
              <LogOut size={18} />
              {t('venue.exit')}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={drawer === 'venue' || drawer === 'documents' || drawer === 'broadcast'}
        onOpenChange={(open) => !open && setDrawer(null)}
      >
        <SheetContent side="bottom" className="cards-light max-h-[88vh] overflow-y-auto lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:w-[440px] lg:rounded-3xl">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>
              {drawer === 'venue'
                ? t('venue.config.title')
                : drawer === 'documents'
                  ? t('venue.drawer.documents')
                  : t('venue.broadcast.title')}
            </SheetTitle>
          </SheetHeader>
          {drawer === 'venue' && (
            <div className="space-y-4">
              <ConfigCard />
              <VenueProfileForm venueId={currentVenue.id} />
            </div>
          )}
          {drawer === 'documents' && <VenueDocuments />}
          {/* Sin evento el aviso sería global, que sólo puede enviar
              administración: se usa el evento con el que se está trabajando. */}
          {drawer === 'broadcast' &&
            (workingEventId ? (
              <VenueBroadcast eventId={workingEventId} venueId={currentVenue.id} />
            ) : (
              <p className="py-6 text-center text-body-sm text-party-gray">{t('venue.door.noEvent')}</p>
            ))}
        </SheetContent>
      </Sheet>

      {puedeDifundir && <VenueWeeklyReport open={reportOpen} onOpenChange={setReportOpen} />}

      <Sheet open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto border-0 bg-transparent p-2 [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{t('venue.events.editEvent')}</SheetTitle>
          </SheetHeader>
          {editing && (
            <CreateEventForm
              key={editing.id}
              event={editing}
              onClose={() => setEditing(null)}
              onCreated={() => {
                setEditing(null);
                void loadAllSummary();
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto border-0 bg-transparent p-2 [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{t('venue.events.newEvent')}</SheetTitle>
          </SheetHeader>
          <CreateEventForm
            onClose={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              setEventFilter('scheduled');
              void loadAllSummary();
            }}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(toBoost)} onOpenChange={(open) => !open && !boosting && setToBoost(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('venue.boost.title', { name: toBoost?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('venue.boost.body', { price: BOOST_PRICE })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={boosting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={boosting}
              onClick={(e) => {
                e.preventDefault();
                void destacar();
              }}
            >
              {boosting ? t('venue.plan.opening') : t('venue.boost.pay', { price: BOOST_PRICE })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('venue.events.deleteTitle', { name: toDelete?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('venue.events.deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteEvent()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Estado vacío de una sección del panel. */
const Vacio: React.FC<{
  icon: typeof QrCode;
  text: string;
  action?: () => void;
  actionLabel?: string;
}> = ({ icon: Icon, text, action, actionLabel }) => (
  <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-12 text-center">
    <Icon size={36} className="mb-3 text-party-primary" />
    <p className="max-w-xs text-body-md text-party-gray">{text}</p>
    {action && actionLabel && (
      <PartyButton size="sm" className="mt-4" onClick={action}>
        {actionLabel}
      </PartyButton>
    )}
  </div>
);

/** Tipo, radio, ubicación y estado del local. */
const ConfigCard = () => {
  const { t } = useTranslation();
  const { currentVenue } = useAppContext();
  if (!currentVenue) return null;

  const filas = [
    { label: t('venue.config.type'), value: t(`venueTypes.${currentVenue.type}`) },
    { label: t('venue.config.radius'), value: `${currentVenue.eventRadius} m` },
    {
      label: t('venue.config.location'),
      value: currentVenue.location ? t('venue.config.locationSet') : t('venue.config.locationUnset'),
    },
  ];

  return (
    <div className="surface-light rounded-2xl p-4">
      <h3 className="mb-3 flex items-center gap-2 font-display text-title-card uppercase">
        <ShieldCheck size={17} />
        {t('venue.config.title')}
      </h3>
      <dl className="divide-y divide-black/[0.06] text-body-sm">
        {filas.map((fila) => (
          <div key={fila.label} className="flex items-center justify-between py-2.5">
            <dt className="text-party-gray">{fila.label}</dt>
            <dd className="font-semibold">{fila.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between py-2.5">
          <dt className="text-party-gray">{t('venue.config.status')}</dt>
          <dd
            className={cn(
              'rounded-md px-2 py-0.5 text-caption font-bold',
              currentVenue.isVerified ? 'bg-party-primary text-ink' : 'bg-destructive/15 text-destructive',
            )}
          >
            {currentVenue.isVerified ? t('venue.config.verified') : t('venue.config.pending')}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-caption text-party-gray">{t('venue.config.contactAdmin')}</p>
    </div>
  );
};

export default VenueDashboardPage;
