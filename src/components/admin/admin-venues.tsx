import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, CalendarDays, ChevronDown, Flame, Loader2, Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { adminService, AdminVenue, AdminVenueEvent } from '@/services/admin';
import { cn } from '@/lib/utils';

/**
 * Todos los locales: su plan, cuánta gente les sigue y los eventos que han
 * creado. El plan se cambia con el desplegable; al abrir un local se cargan sus
 * eventos con lo que dio cada noche.
 */
const AdminVenues = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [busqueda, setBusqueda] = useState('');
  const [locales, setLocales] = useState<AdminVenue[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Record<string, AdminVenueEvent[]>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(
    async (texto: string) => {
      setCargando(true);
      try {
        setLocales(await adminService.listVenues(texto));
      } catch {
        toast({ title: t('common.error'), variant: 'destructive' });
      } finally {
        setCargando(false);
      }
    },
    [toast, t],
  );

  useEffect(() => {
    const id = window.setTimeout(() => void cargar(busqueda), 400);
    return () => window.clearTimeout(id);
  }, [busqueda, cargar]);

  const abrir = async (venue: AdminVenue) => {
    const siguiente = abierto === venue.venueId ? null : venue.venueId;
    setAbierto(siguiente);
    if (!siguiente || eventos[venue.venueId]) return;
    try {
      const lista = await adminService.venueEvents(venue.venueId);
      setEventos((prev) => ({ ...prev, [venue.venueId]: lista }));
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const cambiarPlan = async (venue: AdminVenue, plan: string) => {
    setOcupado(venue.venueId);
    try {
      await adminService.setVenuePlan(venue.venueId, plan as AdminVenue['plan']);
      setLocales((prev) =>
        prev.map((v) => (v.venueId === venue.venueId ? { ...v, plan: plan as AdminVenue['plan'] } : v)),
      );
      toast({ title: t('admin.venuesAll.planSaved') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 text-ink">
        <Search size={17} className="shrink-0 text-ink/50" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t('admin.venuesAll.search')}
          className="h-full border-0 bg-transparent px-0 text-ink placeholder:text-ink/40 focus-visible:ring-0"
        />
      </label>

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
        </div>
      ) : locales.length === 0 ? (
        <p className="py-10 text-center text-body-sm text-party-gray">{t('admin.venuesAll.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {locales.map((venue) => (
            <li key={venue.venueId} className="rounded-2xl bg-white p-3 text-ink">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-display text-title-card">
                    {venue.name}
                    {venue.isVerified && <BadgeCheck size={14} className="shrink-0 text-party-primary" />}
                  </p>
                  <p className="truncate text-caption text-ink/60">
                    {[venue.city, venue.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-ink/50">
                    <span className="flex items-center gap-1">
                      <CalendarDays size={12} />
                      {t('admin.venuesAll.events', { total: venue.eventsTotal, upcoming: venue.eventsUpcoming })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {t('admin.venuesAll.followers', { count: venue.followers })}
                    </span>
                  </p>
                </div>

                <Select
                  value={venue.plan}
                  disabled={ocupado === venue.venueId}
                  onValueChange={(v) => void cambiarPlan(venue, v)}
                >
                  <SelectTrigger className="h-9 w-auto min-w-[7.5rem] gap-2 rounded-full border-black/10 bg-[#F5F5F7] text-ink">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">{t('venue.plan.names.free')}</SelectItem>
                    <SelectItem value="pro">{t('venue.plan.names.pro')}</SelectItem>
                    <SelectItem value="business">{t('venue.plan.names.business')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <button
                type="button"
                onClick={() => void abrir(venue)}
                className="press mt-2 flex items-center gap-1 text-caption font-bold text-ink/60"
              >
                <ChevronDown size={13} className={cn('transition-transform', abierto === venue.venueId && 'rotate-180')} />
                {t('admin.venuesAll.seeEvents')}
              </button>

              {abierto === venue.venueId && (
                <div className="mt-2 space-y-1.5 border-t border-black/[0.06] pt-2">
                  {!eventos[venue.venueId] ? (
                    <Loader2 className="mx-auto my-3 h-5 w-5 animate-spin text-ink/40" />
                  ) : eventos[venue.venueId].length === 0 ? (
                    <p className="py-2 text-caption text-ink/50">{t('admin.venuesAll.noEvents')}</p>
                  ) : (
                    eventos[venue.venueId].map((evento) => (
                      <div key={evento.eventId} className="flex items-center justify-between gap-2 text-caption">
                        <span className="min-w-0 flex-1 truncate">
                          {evento.featuredUntil && new Date(evento.featuredUntil) > new Date() && (
                            <Flame size={11} className="mr-1 inline text-[#FF6A2B]" />
                          )}
                          <strong className="font-bold">{evento.name}</strong>{' '}
                          <span className="text-ink/50">{new Date(evento.startDate).toLocaleDateString()}</span>
                        </span>
                        <span className="shrink-0 text-ink/60">
                          {t('admin.venuesAll.eventStats', {
                            checkIns: evento.checkIns,
                            matches: evento.matches,
                            intents: evento.intents,
                          })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminVenues;
