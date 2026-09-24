import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Ban,
  BarChart3,
  Building,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  Home,
  Image as ImageIcon,
  Inbox,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Paperclip,
  Phone,
  RefreshCw,
  Search,
  Plus,
  Siren,
  Store,
  UsersRound,
  X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import LanguageSwitcher from '@/components/language-switcher';
import AdminMetrics from '@/components/admin/admin-metrics';
import AdminUsers from '@/components/admin/admin-users';
import AdminCreate from '@/components/admin/admin-create';
import AdminEventForm from '@/components/admin/admin-event-form';
import AdminVenues from '@/components/admin/admin-venues';
import TestLabCard from '@/components/admin/test-lab-card';
import { VybeMark } from '@/components/brand/vybe-logo';
import { api } from '@/services/api';
import { openExternal } from '@/services/native';
import { safetyService, SosAlert, PendingPhoto } from '@/services/safety';
import { LEAD_STATUSES, LeadStatus, leadsService, VenueLead } from '@/services/leads';
import { cn } from '@/lib/utils';
import { Venue, Event } from '@/types/venue';
import { Report } from '@/types/user';

/**
 * Secciones del panel.
 *
 * En escritorio se atienden en este orden. En el móvil el menú pone primero lo
 * que no puede esperar (SOS, reportes, fotos): moderar desde el teléfono pasa
 * de verdad, porque una alerta llega de madrugada y quien está de guardia sólo
 * tiene el móvil.
 */
const SECCIONES = [
  { id: 'overview' as const, icon: LayoutGrid },
  { id: 'users' as const, icon: UsersRound },
  { id: 'venuesAll' as const, icon: Store },
  { id: 'venues' as const, icon: Building },
  { id: 'leads' as const, icon: Inbox },
  { id: 'photos' as const, icon: ImageIcon },
  { id: 'reports' as const, icon: Flag },
  { id: 'sos' as const, icon: Siren },
  { id: 'events' as const, icon: CalendarDays },
  { id: 'metrics' as const, icon: BarChart3 },
];

const ORDEN_MOVIL = ['overview', 'sos', 'reports', 'photos', 'users', 'venuesAll', 'venues', 'leads', 'events', 'metrics'] as const;

type Seccion = (typeof SECCIONES)[number]['id'];

/** «hace 4 min», «hace 2 h». */
const hace = (iso: string, t: (k: string, o?: Record<string, unknown>) => string) => {
  const min = Math.max(Math.floor((Date.now() - new Date(iso).getTime()) / 60_000), 0);
  if (min < 60) return t('userProfile.agoMinutes', { count: min });
  const h = Math.floor(min / 60);
  if (h < 48) return t('userProfile.agoHours', { count: h });
  return t('userProfile.agoDays', { count: Math.floor(h / 24) });
};

/** Cabecera de sección: título grande, subtítulo gris y lo que vaya a la derecha. */
const CabeceraSeccion: React.FC<{ title: string; subtitle?: string; count?: number; extra?: React.ReactNode }> = ({
  title,
  subtitle,
  count,
  extra,
}) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="flex items-center gap-2 font-display text-headline-lg lg:text-headline-xl">
        {title}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-party-primary px-2.5 py-0.5 text-body-sm font-extrabold text-ink">{count}</span>
        )}
      </h1>
      {subtitle && <p className="mt-1 max-w-2xl text-body-sm text-party-gray">{subtitle}</p>}
    </div>
    {extra}
  </div>
);

const Vacio: React.FC<{ text: string; icon?: typeof Siren }> = ({ text, icon: Icon = Check }) => (
  <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-12 text-center">
    <Icon size={32} className="mb-3 text-party-primary" />
    <p className="text-body-md text-party-gray">{text}</p>
  </div>
);

/**
 * El panel de moderación interno, según la serie 10 de Stitch: barra lateral
 * con contadores en escritorio, menú de hamburguesa en el móvil, y tarjetas
 * blancas (tablas en escritorio) en cada sección.
 */
const AdminDashboardPage = () => {
  const { logout, currentUser } = useAppContext();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingVenues, setPendingVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [alerts, setAlerts] = useState<SosAlert[]>([]);
  const [leads, setLeads] = useState<VenueLead[]>([]);
  const [leadFilter, setLeadFilter] = useState<LeadStatus | 'all'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // El aviso «Tienes imágenes por revisar» abre directamente la sección.
  // Cambia al crear una cuenta, para volver a cargar las listas.
  const [altas, setAltas] = useState(0);
  // Qué se está dando de alta en la ventana: persona, local o fiesta.
  const [alta, setAlta] = useState<'user' | 'venue' | 'event' | null>(null);
  // Los avisos push abren una sección concreta: fotos por revisar o una alerta.
  const [seccion, setSeccion] = useState<Seccion>(() => {
    const pedida = new URLSearchParams(window.location.search).get('seccion');
    return pedida === 'photos' || pedida === 'sos' ? pedida : 'overview';
  });
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [photoFilter, setPhotoFilter] = useState<'all' | 'event_photo' | 'face_verification'>('all');
  const [eventQuery, setEventQuery] = useState('');

  const [suspendTarget, setSuspendTarget] = useState<Report | null>(null);
  const [suspendDays, setSuspendDays] = useState('');
  const [suspendReason, setSuspendReason] = useState('');

  // Todos los datos salen de Supabase; antes eran arrays escritos a mano.
  const loadAll = useCallback(
    async (silencioso = false) => {
      if (silencioso) setRefreshing(true);
      else setIsLoading(true);
      try {
        const [venues, allEvents, allReports, pendingPhotos, activeAlerts, allLeads] = await Promise.all([
          api.getPendingVenues(),
          api.getAllEventsForAdmin(),
          api.getReports(),
          safetyService.getPendingPhotos(),
          safetyService.getActiveAlerts(),
          // Las solicitudes no deben tumbar el panel si fallan: son lo menos urgente.
          leadsService.list().catch(() => [] as VenueLead[]),
        ]);

        setPendingVenues(venues);
        setEvents(allEvents);
        setReports(allReports);
        setPhotos(pendingPhotos);
        setAlerts(activeAlerts);
        setLeads(allLeads);
        setUpdatedAt(new Date());
      } catch (error) {
        console.error('Error loading admin data:', error);
        toast({ title: t('common.error'), variant: 'destructive' });
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
    },
    [toast, t],
  );

  useEffect(() => {
    void loadAll();
    // Las alertas no pueden esperar a que alguien recargue: se refresca solo
    // cada minuto mientras el panel está abierto.
    const reloj = setInterval(() => void loadAll(true), 60_000);
    return () => clearInterval(reloj);
  }, [loadAll]);

  const run = async (id: string, action: () => Promise<void>, successKey: string) => {
    setBusyId(id);
    try {
      await action();
      toast({ title: t(successKey) });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  /** Abre un documento del local firmando su ruta en el momento. */
  const openDocument = async (path: string) => {
    const url = await api.signedDocumentUrl(path);
    if (url) void openExternal(url);
    else toast({ title: t('common.error'), variant: 'destructive' });
  };

  const pendingReports = reports.filter((r) => r.status === 'pending');
  const ahora = Date.now();
  const enDirecto = events.filter(
    (e) => new Date(e.startDate).getTime() <= ahora && new Date(e.endDate).getTime() > ahora,
  );

  const newLeads = leads.filter((l) => l.status === 'new');
  const leadsVisibles = leadFilter === 'all' ? leads : leads.filter((l) => l.status === leadFilter);

  /** Lo que queda por atender en cada sección, para el menú y los contadores. */
  const porRevisar: Record<Seccion, number> = {
    overview: 0,
    users: 0,
    venuesAll: 0,
    venues: pendingVenues.length,
    leads: newLeads.length,
    photos: photos.length,
    reports: pendingReports.length,
    sos: alerts.length,
    events: 0,
    metrics: 0,
  };

  const fotosVisibles = useMemo(
    () => (photoFilter === 'all' ? photos : photos.filter((p) => p.kind === photoFilter)),
    [photos, photoFilter],
  );

  const eventosVisibles = useMemo(() => {
    const q = eventQuery.trim().toLocaleLowerCase();
    if (!q) return events;
    return events.filter((e) => `${e.name} ${e.venueName ?? ''}`.toLocaleLowerCase().includes(q));
  }, [events, eventQuery]);

  const salir = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const aprobarFoto = (photo: PendingPhoto, approve: boolean) =>
    void run(
      photo.id,
      async () => {
        await safetyService.reviewPhoto(photo.id, approve);
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      },
      approve ? 'admin.photos.approved' : 'admin.photos.rejected',
    );

  const revisarLocal = (venue: Venue, approve: boolean) =>
    void run(
      venue.id,
      async () => {
        await api.reviewVenue(venue.id, approve);
        setPendingVenues((prev) => prev.filter((v) => v.id !== venue.id));
      },
      approve ? 'admin.venues.approved' : 'admin.venues.rejected',
    );

  const cerrarReporte = (report: Report, status: 'resolved' | 'dismissed') =>
    void run(
      report.id,
      async () => {
        await api.resolveReport(report.id, status);
        setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status } : r)));
      },
      status === 'resolved' ? 'admin.reports.resolved' : 'admin.reports.dismissed',
    );

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  const nav = (orden: readonly Seccion[], cerrar?: () => void) => (
    <nav className="space-y-1">
      {orden.map((id) => {
        const { icon: Icon } = SECCIONES.find((s) => s.id === id)!;
        const activa = seccion === id;
        const pendientes = porRevisar[id];
        const esSos = id === 'sos';

        return (
          <button
            key={id}
            type="button"
            aria-current={activa ? 'page' : undefined}
            onClick={() => {
              setSeccion(id);
              cerrar?.();
              window.scrollTo({ top: 0 });
            }}
            className={cn(
              'press flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body-md font-semibold',
              activa
                ? 'bg-party-primary text-ink'
                : esSos && pendientes > 0
                  ? 'text-destructive hover:bg-white/[0.04]'
                  : 'text-[#C8C6C5] hover:bg-white/[0.04]',
            )}
          >
            <Icon size={18} className="shrink-0" />
            <span className="flex-1">{t(`admin.tabs.${id}`)}</span>
            {pendientes > 0 && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-caption font-extrabold',
                  esSos ? 'bg-destructive text-white' : activa ? 'bg-ink text-party-primary' : 'bg-party-primary text-ink',
                )}
              >
                {pendientes}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const nombre = currentUser?.name ?? t('admin.title');

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* ================================================ barra lateral (lg) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.06] bg-card lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <VybeMark size={36} />
          <div className="leading-tight">
            <p className="font-display text-headline-md">{t('admin.shortTitle')}</p>
            <p className="text-caption text-party-gray">{t('admin.staffHq')}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-widest text-party-gray">
            {t('admin.navigation')}
          </p>
          {nav(SECCIONES.map((s) => s.id))}
        </div>
        <div className="space-y-1 border-t border-white/[0.06] p-3">
          <Link
            to="/home"
            className="press flex h-11 items-center gap-3 rounded-xl px-3 text-body-md text-[#C8C6C5] hover:bg-white/[0.04]"
          >
            <Home size={18} />
            {t('nav.home')}
          </Link>
          <button
            type="button"
            onClick={() => void salir()}
            className="press flex h-11 w-full items-center gap-3 rounded-xl px-3 text-body-md font-semibold text-destructive hover:bg-destructive/10"
          >
            <LogOut size={18} />
            {t('venue.exit')}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* ============================================== barra superior */}
        <header className="pt-safe sticky top-0 z-30 border-b border-white/[0.06] bg-card/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label={t('admin.menu')}
                onClick={() => setMenuAbierto(true)}
                className="press relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-high lg:hidden"
              >
                <Menu size={19} />
                {alerts.length + pendingReports.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                )}
              </button>
              <VybeMark size={32} className="lg:hidden" />
              <div className="min-w-0 leading-tight">
                <p className="truncate font-display text-title-card lg:text-headline-md">{t(`admin.tabs.${seccion}`)}</p>
                <p className="truncate text-caption text-party-gray">
                  {updatedAt ? t('admin.updated', { time: hace(updatedAt.toISOString(), t) }) : t('admin.staffHq')}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void loadAll(true)}
                aria-label={t('admin.refresh')}
                className="press flex h-10 w-10 items-center justify-center rounded-xl bg-surface-high"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <LanguageSwitcher />
              <div className="hidden text-right leading-tight sm:block">
                <p className="font-display text-title-card">{nombre}</p>
                <p className="text-caption text-party-gray">{t('admin.role')}</p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-party-primary font-display text-caption font-extrabold uppercase text-party-primary">
                {nombre.slice(0, 2)}
              </span>
            </div>
          </div>
        </header>

        {/* Menú del móvil. Seis pestañas en una fila no caben: se apilaban y
            los contadores se pisaban. Una lista vertical tiene sitio para el
            nombre y para decir cuántas cosas hay pendientes. */}
        <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
          <SheetContent side="left" className="flex w-72 flex-col bg-card p-0">
            <SheetHeader className="flex-row items-center gap-3 space-y-0 border-b border-white/[0.06] p-4 text-left">
              <VybeMark size={34} />
              <SheetTitle className="text-title-card">{t('admin.title')}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-3">{nav(ORDEN_MOVIL, () => setMenuAbierto(false))}</div>
            <div className="space-y-1 border-t border-white/[0.06] p-3">
              <Link
                to="/home"
                className="press flex h-11 items-center gap-3 rounded-xl px-3 text-body-md text-[#C8C6C5]"
              >
                <Home size={18} />
                {t('nav.home')}
              </Link>
              <button
                type="button"
                onClick={() => void salir()}
                className="press flex h-11 w-full items-center gap-3 rounded-xl px-3 text-body-md font-semibold text-destructive"
              >
                <LogOut size={18} />
                {t('venue.exit')}
              </button>
            </div>
          </SheetContent>
        </Sheet>

        <main className="cards-light mx-auto max-w-[1200px] px-4 pb-16 pt-5 lg:px-8 lg:pt-8">
          {/* ================================================== resumen */}
          {seccion === 'overview' && (
            <>
              <CabeceraSeccion title={t('admin.overview.title')} subtitle={t('admin.overview.subtitle')} />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
                {[
                  { id: 'sos' as const, label: t('admin.overview.sos'), value: alerts.length, help: t('admin.overview.sosHelp'), danger: true },
                  { id: 'reports' as const, label: t('admin.overview.reports'), value: pendingReports.length, help: t('admin.overview.reportsHelp') },
                  { id: 'photos' as const, label: t('admin.overview.photos'), value: photos.length, help: t('admin.overview.photosHelp'), urgent: photos.filter((p) => p.urgent).length },
                  { id: 'venues' as const, label: t('admin.overview.venues'), value: pendingVenues.length, help: t('admin.overview.venuesHelp') },
                  { id: 'events' as const, label: t('admin.overview.live'), value: enDirecto.length, help: t('admin.overview.liveHelp') },
                  { id: 'leads' as const, label: t('admin.overview.leads'), value: newLeads.length, help: t('admin.overview.leadsHelp') },
                ].map((card, index) => (
                  <button
                    key={`${card.id}-${index}`}
                    type="button"
                    onClick={() => setSeccion(card.id)}
                    className={cn(
                      'surface-light press relative overflow-hidden rounded-2xl p-4 text-left lg:p-5',
                      card.danger && card.value > 0 && 'border-l-4 !border-l-destructive',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'flex items-center gap-1.5 text-caption font-bold uppercase tracking-wide',
                          card.danger && card.value > 0 ? 'text-destructive' : 'text-party-gray',
                        )}
                      >
                        {card.danger && card.value > 0 && <span className="h-2 w-2 rounded-full bg-destructive" />}
                        {card.label}
                      </p>
                      {card.urgent ? (
                        <span className="rounded-md bg-party-primary px-1.5 py-0.5 text-[10px] font-extrabold text-ink">
                          {t('admin.overview.urgent', { count: card.urgent })}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        'mt-2 font-display text-[28px] font-extrabold leading-none tabular lg:text-[34px]',
                        card.danger && card.value > 0 && 'text-destructive',
                      )}
                    >
                      {card.value}
                    </p>
                    <p className="mt-2 hidden text-caption text-party-gray sm:block">{card.help}</p>
                  </button>
                ))}
              </div>

              {/* Lo siguiente que hay que hacer, sin tener que ir sección por
                  sección: primero SOS, después reportes, después fotos de gente
                  que espera dentro de un evento. */}
              <section className="surface-light mt-5 rounded-2xl p-4 lg:p-5">
                <h2 className="mb-3 font-display text-headline-md">{t('admin.overview.queue')}</h2>
                {alerts.length + pendingReports.length + photos.length + pendingVenues.length + newLeads.length === 0 ? (
                  <p className="text-body-sm text-party-gray">{t('admin.overview.allClear')}</p>
                ) : (
                  <ul className="divide-y divide-black/[0.06]">
                    {[
                      ...alerts.map((a) => ({
                        key: `sos-${a.id}`,
                        icon: Siren,
                        tone: 'danger' as const,
                        title: t('admin.overview.sosItem', { name: a.profileName ?? '—' }),
                        detail: a.eventName ?? '',
                        at: a.createdAt,
                        go: 'sos' as const,
                      })),
                      ...pendingReports.slice(0, 5).map((r) => ({
                        key: `rep-${r.id}`,
                        icon: Flag,
                        tone: 'default' as const,
                        title: r.reportedName ?? t('admin.reports.deletedProfile'),
                        detail: t(`report.reasons.${r.reportType}`),
                        at: r.createdAt,
                        go: 'reports' as const,
                      })),
                      ...photos
                        .filter((p) => p.urgent)
                        .slice(0, 5)
                        .map((p) => ({
                          key: `pho-${p.id}`,
                          icon: ImageIcon,
                          tone: 'default' as const,
                          title: t('admin.photos.uploadedBy', { name: p.profileName ?? '—' }),
                          detail: p.eventName ? t('admin.photos.waitingAt', { event: p.eventName }) : '',
                          at: p.createdAt,
                          go: 'photos' as const,
                        })),
                      ...pendingVenues.slice(0, 5).map((v) => ({
                        key: `ven-${v.id}`,
                        icon: Building,
                        tone: 'default' as const,
                        title: v.name,
                        detail: t(`venueTypes.${v.type}`),
                        at: v.createdAt ?? new Date().toISOString(),
                        go: 'venues' as const,
                      })),
                      ...newLeads.slice(0, 5).map((l) => ({
                        key: `lead-${l.id}`,
                        icon: Inbox,
                        tone: 'default' as const,
                        title: t('admin.overview.leadItem', { name: l.venueName }),
                        detail: l.city,
                        at: l.createdAt,
                        go: 'leads' as const,
                      })),
                    ].map((item) => (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => setSeccion(item.go)}
                          className="press flex w-full items-center gap-3 py-3 text-left"
                        >
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                              item.tone === 'danger' ? 'bg-destructive text-white' : 'bg-black/[0.06]',
                            )}
                          >
                            <item.icon size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-md font-bold">{item.title}</span>
                            <span className="block truncate text-caption text-party-gray">{item.detail}</span>
                          </span>
                          <span className="shrink-0 text-caption text-party-gray">{hace(item.at, t)}</span>
                          <ChevronRight size={16} className="shrink-0 text-party-gray" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <TestLabCard />
            </>
          )}

          {/* =================================================== locales */}
          {seccion === 'venues' && (
            <>
              <CabeceraSeccion
                title={t('admin.venues.title')}
                subtitle={t('admin.venues.subtitle')}
                count={pendingVenues.length}
              />
              {pendingVenues.length === 0 ? (
                <Vacio text={t('admin.venues.empty')} />
              ) : (
                <>
                  {/* Escritorio: tabla. */}
                  <div className="surface-light hidden overflow-hidden rounded-2xl lg:block">
                    <table className="w-full text-left text-body-sm">
                      <thead className="border-b border-black/[0.06] text-caption uppercase tracking-wide text-party-gray">
                        <tr>
                          <th className="px-5 py-3 font-bold">{t('admin.venues.colVenue')}</th>
                          <th className="px-3 py-3 font-bold">{t('admin.venues.colCity')}</th>
                          <th className="px-3 py-3 font-bold">{t('auth.taxId')}</th>
                          <th className="px-3 py-3 font-bold">{t('admin.venues.colDocs')}</th>
                          <th className="px-3 py-3 font-bold">{t('admin.venues.colRequested')}</th>
                          <th className="px-5 py-3 text-right font-bold">{t('admin.venues.colActions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.06]">
                        {pendingVenues.map((venue) => (
                          <tr key={venue.id} className="hover:bg-black/[0.02]">
                            <td className="px-5 py-3">
                              <p className="font-bold">{venue.name}</p>
                              <p className="text-caption text-party-gray">
                                {t(`venueTypes.${venue.type}`)} · {venue.email}
                              </p>
                              {venue.postalAddress && <p className="text-caption text-party-gray">{venue.postalAddress}</p>}
                            </td>
                            <td className="px-3 py-3">{venue.city ?? '—'}</td>
                            <td className="px-3 py-3 font-mono">{venue.taxId ?? '—'}</td>
                            <td className="px-3 py-3">
                              {venue.documents && venue.documents.length > 0 ? (
                                <span className="flex flex-wrap gap-1">
                                  {venue.documents.map((path, index) => (
                                    <button
                                      key={path}
                                      type="button"
                                      onClick={() => void openDocument(path)}
                                      className="press inline-flex items-center gap-1 font-semibold text-[#7a6200] underline underline-offset-2"
                                    >
                                      <Paperclip size={13} />
                                      {index + 1}
                                    </button>
                                  ))}
                                </span>
                              ) : (
                                <span className="text-caption text-destructive">{t('admin.venues.noDocuments')}</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-party-gray">
                              {venue.createdAt ? new Date(venue.createdAt).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={busyId === venue.id}
                                  onClick={() => revisarLocal(venue, true)}
                                  className="press h-9 rounded-lg bg-party-primary px-3 text-caption font-bold text-ink disabled:opacity-50"
                                >
                                  {t('admin.venues.approve')}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === venue.id}
                                  onClick={() => revisarLocal(venue, false)}
                                  className="press h-9 rounded-lg border border-black/15 px-3 text-caption font-bold disabled:opacity-50"
                                >
                                  {t('admin.venues.reject')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Móvil: una tarjeta por local, nunca una tabla que se desliza de lado. */}
                  <ul className="space-y-3 lg:hidden">
                    {pendingVenues.map((venue) => (
                      <li key={venue.id} className="surface-light rounded-2xl p-4">
                        <p className="font-display text-headline-md">{venue.name}</p>
                        <p className="text-caption text-party-gray">
                          {t(`venueTypes.${venue.type}`)} · {venue.eventRadius} m
                        </p>
                        <dl className="mt-3 space-y-1.5 text-body-sm">
                          {[
                            [t('auth.email'), venue.email],
                            [t('auth.taxId'), venue.taxId],
                            [t('auth.venueAddress'), venue.postalAddress],
                            [t('auth.phone'), venue.phone],
                            [
                              t('admin.venues.colRequested'),
                              venue.createdAt ? new Date(venue.createdAt).toLocaleDateString() : undefined,
                            ],
                          ]
                            .filter(([, value]) => value)
                            .map(([label, value]) => (
                              <div key={label} className="flex justify-between gap-3">
                                <dt className="text-party-gray">{label}</dt>
                                <dd className="truncate text-right font-semibold">{value}</dd>
                              </div>
                            ))}
                        </dl>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {venue.documents && venue.documents.length > 0 ? (
                            venue.documents.map((path, index) => (
                              <button
                                key={path}
                                type="button"
                                onClick={() => void openDocument(path)}
                                className="press inline-flex h-8 items-center gap-1 rounded-lg bg-black/[0.05] px-2.5 text-caption font-bold"
                              >
                                <FileText size={13} />
                                {t('admin.venues.document', { n: index + 1 })}
                              </button>
                            ))
                          ) : (
                            <span className="text-caption text-destructive">{t('admin.venues.noDocuments')}</span>
                          )}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={busyId === venue.id}
                            onClick={() => revisarLocal(venue, true)}
                            className="press h-11 rounded-xl bg-party-primary font-bold text-ink disabled:opacity-50"
                          >
                            {t('admin.venues.approve')}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === venue.id}
                            onClick={() => revisarLocal(venue, false)}
                            className="press h-11 rounded-xl border border-black/15 font-bold disabled:opacity-50"
                          >
                            {t('admin.venues.reject')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {/* ===================================================== fotos */}
          {seccion === 'photos' && (
            <>
              <CabeceraSeccion title={t('admin.photos.title')} subtitle={t('admin.photos.subtitle')} count={photos.length} />
              <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
                {(['all', 'event_photo', 'face_verification'] as const).map((filtro) => {
                  const cuantas = filtro === 'all' ? photos.length : photos.filter((p) => p.kind === filtro).length;
                  return (
                    <button
                      key={filtro}
                      type="button"
                      onClick={() => setPhotoFilter(filtro)}
                      aria-pressed={photoFilter === filtro}
                      className={cn(
                        'press h-8 shrink-0 rounded-full px-3 text-caption font-bold',
                        photoFilter === filtro ? 'bg-party-primary text-ink' : 'bg-card text-[#C8C6C5]',
                      )}
                    >
                      {filtro === 'all' ? t('admin.photos.all') : t(`admin.photos.kinds.${filtro}`)} ({cuantas})
                    </button>
                  );
                })}
              </div>

              {fotosVisibles.length === 0 ? (
                <Vacio text={t('admin.photos.empty')} />
              ) : (
                <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
                  {fotosVisibles.map((photo) => (
                    <li key={photo.id} className="surface-light flex flex-col rounded-2xl p-2">
                      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-black/[0.05]">
                        <img src={photo.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        {photo.kind && photo.kind !== 'photo' && (
                          <span className="absolute left-2 top-2 rounded-md bg-[#0E0E11]/80 px-2 py-0.5 text-[10px] font-bold text-white">
                            {t(`admin.photos.kinds.${photo.kind}`, { defaultValue: photo.kind })}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col px-1 pb-1 pt-2">
                        {/* La cola viene ordenada por urgencia; sin decirlo, el
                            orden parecía arbitrario. */}
                        {photo.urgent && (
                          <span className="mb-1.5 flex items-center gap-1 self-start rounded-md bg-party-primary px-1.5 py-0.5 text-[10px] font-extrabold text-ink">
                            <Clock size={11} className="shrink-0" />
                            <span className="line-clamp-1">
                              {photo.eventName ? t('admin.photos.waitingAt', { event: photo.eventName }) : t('admin.photos.waiting')}
                            </span>
                          </span>
                        )}
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-body-sm font-bold">{photo.profileName ?? '—'}</p>
                          <span className="shrink-0 text-[10px] text-party-gray">{hace(photo.createdAt, t)}</span>
                        </div>
                        {photo.score !== undefined && (
                          <p className="text-caption text-party-gray">
                            {t('admin.photos.autoScore', { score: photo.score.toFixed(2) })}
                          </p>
                        )}
                        <div className="mt-auto grid grid-cols-2 gap-1.5 pt-2">
                          <button
                            type="button"
                            disabled={busyId === photo.id}
                            onClick={() => aprobarFoto(photo, true)}
                            className="press h-9 rounded-lg bg-party-primary text-caption font-bold text-ink disabled:opacity-50"
                          >
                            {t('admin.photos.approve')}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === photo.id}
                            onClick={() => aprobarFoto(photo, false)}
                            className="press h-9 rounded-lg bg-black/[0.05] text-caption font-bold disabled:opacity-50"
                          >
                            {t('admin.photos.reject')}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* ================================================== reportes */}
          {seccion === 'reports' && (
            <>
              <CabeceraSeccion
                title={t('admin.reports.title')}
                subtitle={t('admin.reports.subtitle')}
                count={pendingReports.length}
              />
              {reports.length === 0 ? (
                <Vacio text={t('admin.reports.empty')} />
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {reports.map((report) => {
                    const pendiente = report.status === 'pending';
                    const nombreReportado = report.reportedName ?? t('admin.reports.deletedProfile');
                    return (
                      <li key={report.id} className={cn('surface-light rounded-2xl p-4', !pendiente && 'opacity-60')}>
                        <div className="flex items-start gap-3">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.07] text-caption font-extrabold uppercase">
                            {nombreReportado.slice(0, 2)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="truncate font-display text-title-card">{nombreReportado}</p>
                              <span className="shrink-0 text-caption text-party-gray">{hace(report.createdAt, t)}</span>
                            </div>
                            {report.reporterName && (
                              <p className="text-caption text-party-gray">
                                {t('admin.reports.reportedBy', { name: report.reporterName })}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <span className="rounded-md bg-destructive px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">
                                {t(`report.reasons.${report.reportType}`)}
                              </span>
                              {!pendiente && (
                                <span className="rounded-md bg-black/[0.07] px-2 py-0.5 text-[10px] font-bold uppercase">
                                  {t(`admin.reports.status.${report.status}`, { defaultValue: report.status })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {report.description && (
                          <p className="mt-3 rounded-xl bg-black/[0.04] p-3 text-body-sm italic text-ink/70">
                            “{report.description}”
                          </p>
                        )}

                        {pendiente && (
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={busyId === report.id}
                              onClick={() => cerrarReporte(report, 'dismissed')}
                              className="press flex h-10 items-center justify-center gap-1 rounded-lg border border-black/10 text-caption font-bold text-party-gray disabled:opacity-50"
                            >
                              <X size={14} />
                              {t('admin.reports.dismiss')}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === report.id}
                              onClick={() => cerrarReporte(report, 'resolved')}
                              className="press flex h-10 items-center justify-center gap-1 rounded-lg border border-ink text-caption font-bold disabled:opacity-50"
                            >
                              <Check size={14} />
                              {t('admin.reports.resolve')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSuspendTarget(report)}
                              className="press flex h-10 items-center justify-center gap-1 rounded-lg bg-destructive text-caption font-bold text-white"
                            >
                              <Ban size={14} />
                              {t('admin.reports.suspend')}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {/* ======================================================= SOS */}
          {seccion === 'sos' && (
            <>
              <CabeceraSeccion title={t('admin.sos.title')} subtitle={t('admin.sos.subtitle')} />
              {alerts.length === 0 ? (
                <Vacio text={t('admin.sos.empty')} icon={Siren} />
              ) : (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {alerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="surface-light overflow-hidden rounded-2xl border-l-[6px] !border-l-destructive p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="rounded-md bg-destructive px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">
                            {t('admin.sos.badge')}
                          </span>
                          <p className="mt-2 truncate font-display text-headline-md">{alert.profileName ?? '—'}</p>
                          {alert.eventName && (
                            <p className="text-body-sm text-party-gray">{t('admin.sos.at', { event: alert.eventName })}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                            <Siren size={20} />
                          </span>
                          <p className="mt-1 text-caption font-extrabold text-destructive">{hace(alert.createdAt, t)}</p>
                        </div>
                      </div>

                      {alert.note && <p className="mt-3 rounded-xl bg-black/[0.04] p-3 text-body-sm">{alert.note}</p>}

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {alert.latitude !== undefined && alert.longitude !== undefined ? (
                          <button
                            type="button"
                            onClick={() =>
                              void openExternal(`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`)
                            }
                            className="press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-ink text-caption font-bold uppercase text-white"
                          >
                            <MapPin size={15} />
                            {t('admin.sos.openMap')}
                          </button>
                        ) : (
                          <span className="flex h-11 items-center justify-center rounded-xl bg-black/[0.04] text-caption text-party-gray">
                            {t('admin.sos.noLocation')}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={busyId === alert.id}
                          onClick={() =>
                            void run(
                              alert.id,
                              async () => {
                                await safetyService.resolveAlert(alert.id);
                                setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
                              },
                              'admin.sos.resolved',
                            )
                          }
                          className="press flex h-11 items-center justify-center gap-1.5 rounded-xl border border-black/15 text-caption font-bold uppercase disabled:opacity-50"
                        >
                          <Check size={15} />
                          {t('admin.sos.resolve')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* =================================================== eventos */}
          {seccion === 'events' && (
            <>
              <CabeceraSeccion
                title={t('admin.events.title')}
                subtitle={t('admin.events.subtitle')}
                extra={
                  <label className="relative w-full sm:w-72">
                    <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-party-gray" />
                    <Input
                      value={eventQuery}
                      onChange={(e) => setEventQuery(e.target.value)}
                      placeholder={t('admin.events.search')}
                      aria-label={t('admin.events.search')}
                      className="h-10 pl-10"
                    />
                  </label>
                }
              />
              {eventosVisibles.length === 0 ? (
                <Vacio text={t('admin.events.empty')} icon={CalendarDays} />
              ) : (
                <div className="surface-light overflow-hidden rounded-2xl">
                  <table className="w-full text-left text-body-sm">
                    <thead className="hidden border-b border-black/[0.06] text-caption uppercase tracking-wide text-party-gray sm:table-header-group">
                      <tr>
                        <th className="px-4 py-3 font-bold">{t('admin.events.colEvent')}</th>
                        <th className="px-3 py-3 font-bold">{t('admin.events.colDate')}</th>
                        <th className="px-3 py-3 font-bold">{t('admin.events.colStatus')}</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {eventosVisibles.map((event) => {
                        const inicio = new Date(event.startDate).getTime();
                        const fin = new Date(event.endDate).getTime();
                        const estado = inicio <= ahora && fin > ahora ? 'live' : fin <= ahora ? 'past' : 'scheduled';
                        return (
                          <tr key={event.id} className="hover:bg-black/[0.02]">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/[0.06]">
                                  {event.posterUrl ? (
                                    <img src={event.posterUrl} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <CalendarDays size={15} className="text-party-gray" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-bold">{event.name}</p>
                                  <p className="truncate text-caption text-party-gray">
                                    {event.venueName ?? '—'}
                                    <span className="sm:hidden"> · {new Date(event.startDate).toLocaleDateString()}</span>
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="hidden px-3 py-3 text-party-gray sm:table-cell">
                              {new Date(event.startDate).toLocaleString(undefined, {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="hidden px-3 py-3 sm:table-cell">
                              <span
                                className={cn(
                                  'rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase',
                                  estado === 'live' ? 'bg-party-primary text-ink' : 'bg-black/[0.07] text-ink/70',
                                )}
                              >
                                {t(`venue.events.status.${estado}`)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                disabled={busyId === event.id}
                                onClick={() =>
                                  void run(
                                    event.id,
                                    async () => {
                                      await api.deleteEvent(event.id);
                                      setEvents((prev) => prev.filter((e) => e.id !== event.id));
                                    },
                                    'venue.events.deleted',
                                  )
                                }
                                className="press h-8 rounded-lg border border-destructive/40 px-2.5 text-caption font-bold text-destructive disabled:opacity-50"
                              >
                                {t('common.delete')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ============================================== solicitudes */}
          {seccion === 'leads' && (
            <>
              <CabeceraSeccion
                title={t('admin.leads.title')}
                subtitle={t('admin.leads.subtitle')}
                count={newLeads.length}
                extra={
                  <div className="flex flex-wrap gap-1.5">
                    {(['all', ...LEAD_STATUSES] as const).map((filtro) => (
                      <button
                        key={filtro}
                        type="button"
                        onClick={() => setLeadFilter(filtro)}
                        className={cn(
                          'press h-9 rounded-full px-3 text-caption font-bold',
                          leadFilter === filtro ? 'bg-party-primary text-ink' : 'bg-white/[0.06] text-[#C8C6C5]',
                        )}
                      >
                        {filtro === 'all' ? t('admin.leads.all') : t(`admin.leads.statuses.${filtro}`)}
                      </button>
                    ))}
                  </div>
                }
              />
              {leadsVisibles.length === 0 ? (
                <Vacio text={t('admin.leads.empty')} icon={Inbox} />
              ) : (
                <ul className="space-y-3">
                  {leadsVisibles.map((lead) => {
                    const esEmail = lead.contact.includes('@');
                    const enlace = esEmail
                      ? `mailto:${lead.contact}?subject=${encodeURIComponent(`Fiestea · ${lead.venueName}`)}`
                      : `tel:${lead.contact.replace(/[^+0-9]/g, '')}`;
                    return (
                      <li key={lead.id} className="surface-light rounded-2xl p-4 lg:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-display text-headline-md">
                              {lead.venueName}
                              {lead.status === 'new' && (
                                <span className="rounded-full bg-party-primary px-2 py-0.5 text-caption text-ink">
                                  {t('admin.leads.statuses.new')}
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-body-sm text-party-gray">
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={13} />
                                {lead.city}
                              </span>
                              {lead.venueType && <span>· {t(`landing.form.types.${lead.venueType}`)}</span>}
                              <span>· {hace(lead.createdAt, t)}</span>
                              {lead.locale && <span className="uppercase">· {lead.locale}</span>}
                            </p>
                          </div>
                          <label className="flex items-center gap-2 text-caption font-bold text-party-gray">
                            {t('admin.leads.status')}
                            <select
                              value={lead.status}
                              disabled={busyId === lead.id}
                              onChange={(e) => {
                                const status = e.target.value as LeadStatus;
                                void run(
                                  lead.id,
                                  async () => {
                                    await leadsService.setStatus(lead.id, status);
                                    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
                                  },
                                  'admin.leads.updated',
                                );
                              }}
                              className="h-9 rounded-lg border border-black/10 bg-white px-2 text-body-sm font-semibold text-ink"
                            >
                              {LEAD_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {t(`admin.leads.statuses.${status}`)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {lead.message && (
                          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-black/[0.04] p-3 text-body-sm">{lead.message}</p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-body-sm">{lead.contact}</span>
                          <a
                            href={enlace}
                            className="press ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-caption font-bold text-white"
                          >
                            {esEmail ? <Mail size={14} /> : <Phone size={14} />}
                            {t('admin.leads.contact')}
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {/* ================================================== métricas */}
          {seccion === 'users' && (
            <AdminUsers key={`usuarios-${altas}`} />
          )}

          {seccion === 'venuesAll' && (
            <AdminVenues key={`locales-${altas}`} />
          )}

          {seccion === 'metrics' && <AdminMetrics />}
        </main>

      {/* ------------------------------------------- añadir, siempre a mano */}
      {(seccion === 'users' || seccion === 'venuesAll' || seccion === 'events') && (
        <button
          type="button"
          onClick={() => setAlta(seccion === 'users' ? 'user' : seccion === 'venuesAll' ? 'venue' : 'event')}
          className="press pb-safe fixed bottom-4 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-party-primary px-5 font-display text-title-card text-ink shadow-xl shadow-black/30"
        >
          <Plus size={18} />
          {t(
            seccion === 'users'
              ? 'admin.create.addUser'
              : seccion === 'venuesAll'
                ? 'admin.create.addVenue'
                : 'admin.create.addEvent',
          )}
        </button>
      )}

      <Dialog open={alta !== null} onOpenChange={(open) => !open && setAlta(null)}>
        <DialogContent className="surface-light !bg-white max-h-[88vh] overflow-y-auto text-ink sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>
              {t(
                alta === 'user'
                  ? 'admin.create.addUser'
                  : alta === 'venue'
                    ? 'admin.create.addVenue'
                    : 'admin.create.addEvent',
              )}
            </DialogTitle>
            <DialogDescription>
              {t(alta === 'event' ? 'admin.newEvent.subtitle' : 'admin.create.subtitle')}
            </DialogDescription>
          </DialogHeader>

          {alta === 'event' ? (
            <AdminEventForm
              bare
              onCreated={() => {
                setAlta(null);
                setAltas((n) => n + 1);
              }}
            />
          ) : (
            alta && (
              <AdminCreate
                bare
                type={alta}
                onCreated={() => {
                  setAlta(null);
                  setAltas((n) => n + 1);
                }}
              />
            )
          )}
        </DialogContent>
      </Dialog>
      </div>

      {/* Diálogo de suspensión */}
      <Dialog open={suspendTarget !== null} onOpenChange={(open) => !open && setSuspendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.reports.suspendTitle', { name: suspendTarget?.reportedName ?? '—' })}</DialogTitle>
            <DialogDescription>{t('admin.reports.suspendPermanent')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="suspend-days">{t('admin.reports.suspendDays')}</Label>
              <Input
                id="suspend-days"
                type="number"
                min={1}
                value={suspendDays}
                onChange={(e) => setSuspendDays(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suspend-reason">{t('admin.reports.suspendReason')}</Label>
              <Input id="suspend-reason" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <PartyButton variant="outline" onClick={() => setSuspendTarget(null)}>
              {t('common.cancel')}
            </PartyButton>
            <PartyButton
              variant="destructive"
              onClick={() => {
                const target = suspendTarget;
                if (!target) return;
                setSuspendTarget(null);

                void run(
                  target.id,
                  async () => {
                    await safetyService.suspendProfile(
                      target.reportedId,
                      suspendDays ? Number(suspendDays) : undefined,
                      suspendReason || undefined,
                    );
                    await api.resolveReport(target.id, 'resolved');
                    setReports((prev) => prev.map((r) => (r.id === target.id ? { ...r, status: 'resolved' } : r)));
                    setSuspendDays('');
                    setSuspendReason('');
                  },
                  'admin.reports.suspended',
                );
              }}
            >
              <Ban size={15} />
              {t('admin.reports.suspend')}
            </PartyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboardPage;
