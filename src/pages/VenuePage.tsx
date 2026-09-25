import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  AtSign,
  BadgeCheck,
  Bell,
  BellRing,
  Clock,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Martini,
  Navigation,
  Phone,
  Sparkles,
} from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import MapThumb from '@/components/map-thumb';
import { LivePill, formatHourRange } from '@/components/event-bits';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { openExternal } from '@/services/native';
import { nightService, OpeningDay, VenueEventSummary, VenueProfile } from '@/services/night';
import { cn } from '@/lib/utils';

/** Lunes = 0 … domingo = 6, como se guarda el horario. */
const diaHoy = () => (new Date().getDay() + 6) % 7;

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');

/** Nombre del día en el idioma del teléfono (2026-09-14 fue lunes). */
const nombreDia = (day: number) =>
  new Date(Date.UTC(2026, 8, 14 + day, 12)).toLocaleDateString(undefined, { weekday: 'long' });

/**
 * La ficha de un local: quién es, cuándo abre, dónde está y sus fiestas (la que
 * está en marcha, las próximas y las pasadas). Aquí se sigue al local para que
 * avise de sus fiestas nuevas.
 */
const VenuePage = () => {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [venue, setVenue] = useState<VenueProfile | null>(null);
  const [events, setEvents] = useState<VenueEventSummary[]>([]);
  const [estado, setEstado] = useState<'loading' | 'ready' | 'not-found'>('loading');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!venueId) return;
    const [perfil, lista] = await Promise.all([
      nightService.getVenueProfile(venueId),
      nightService.getVenueEvents(venueId),
    ]);
    setVenue(perfil);
    setEvents(lista);
    setEstado(perfil ? 'ready' : 'not-found');
  }, [venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const seguir = async () => {
    if (!venue) return;
    setBusy(true);
    try {
      const ahora = await nightService.toggleFollow(venue.id);
      setVenue({ ...venue, iFollow: ahora, followers: venue.followers + (ahora ? 1 : -1) });
      if (ahora) toast({ title: t('venuePage.followed', { name: venue.name }), description: t('venuePage.followedBody') });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (estado === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <Martini size={40} className="text-party-primary" />
        <p className="font-display text-headline-md">{t('venuePage.notFound')}</p>
        <button type="button" onClick={() => navigate(-1)} className="press text-body-sm underline">
          {t('common.back')}
        </button>
      </div>
    );
  }

  const ahora = Date.now();
  const enDirecto = events.find(
    (e) => new Date(e.startDate).getTime() <= ahora && new Date(e.endDate).getTime() > ahora,
  );
  const proximos = events.filter((e) => new Date(e.startDate).getTime() > ahora);
  const pasados = events.filter((e) => new Date(e.endDate).getTime() <= ahora);
  const hoy = diaHoy();
  const horarioHoy = venue.openingHours.find((d) => d.day === hoy);

  const tarjeta = (event: VenueEventSummary, pasado = false) => (
    <li key={event.id}>
      <button
        type="button"
        onClick={() => navigate(`/event/${event.id}`)}
        className={cn(
          'press flex w-full items-center gap-3 rounded-2xl p-3 text-left',
          pasado ? 'bg-surface-low text-party-gray' : 'bg-white text-ink',
        )}
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/10">
          {event.posterUrl ? (
            <img src={event.posterUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Martini size={20} className="opacity-40" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-display text-title-card">{event.name}</span>
            {event.featured && <Sparkles size={14} className="shrink-0 text-party-accent" />}
          </span>
          <span className={cn('block truncate text-body-sm', pasado ? '' : 'text-ink/60')}>
            {fechaCorta(event.startDate)} · {formatHourRange(event.startDate, event.endDate)}
          </span>
          {event.theme && <span className={cn('block truncate text-caption', pasado ? '' : 'text-ink/50')}>{event.theme}</span>}
        </span>
      </button>
    </li>
  );

  const fila = (d: OpeningDay) => (
    <li
      key={d.day}
      className={cn('flex items-center justify-between py-1.5 text-body-sm', d.day === hoy && 'font-bold text-party-primary')}
    >
      <span className="capitalize">{nombreDia(d.day)}</span>
      <span className="tabular">{d.closed ? t('venuePage.closed') : `${d.open} – ${d.close}`}</span>
    </li>
  );

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto max-w-2xl space-y-5 px-margin pt-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-surface-low"
        >
          <ArrowLeft size={20} />
        </button>

        {/* ---------------------------------------------------------- cabecera */}
        <section className="rounded-3xl bg-surface-low p-5">
          <div className="flex items-start gap-4">
            {venue.logoUrl ? (
              <img src={venue.logoUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-party-primary font-display text-headline-md font-black text-ink">
                {venue.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p.charAt(0).toUpperCase())
                  .join('')}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-headline-lg leading-tight">{venue.name}</h1>
              <p className="text-body-sm text-party-gray">
                {t(`venueTypes.${venue.type}`, { defaultValue: venue.type })}
                {venue.city ? ` · ${venue.city}` : ''}
              </p>
              {venue.subscribed && (
                <p className="mt-1 flex items-center gap-1 text-caption font-bold text-party-primary">
                  <BadgeCheck size={14} />
                  {t('venuePage.vybeVenue')}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void seguir()}
              aria-pressed={venue.iFollow}
              className={cn(
                'press flex h-11 flex-1 items-center justify-center gap-2 rounded-xl font-display text-title-card disabled:opacity-60',
                venue.iFollow ? 'bg-surface-high text-foreground' : 'bg-party-primary text-ink',
              )}
            >
              {venue.iFollow ? <BellRing size={17} /> : <Bell size={17} />}
              {venue.iFollow ? t('venuePage.following') : t('venuePage.follow')}
            </button>
            <p className="shrink-0 text-body-sm text-party-gray">
              {t('venuePage.followers', { count: venue.followers })}
            </p>
          </div>
          {!venue.iFollow && <p className="mt-2 text-caption text-party-gray">{t('venuePage.followHint')}</p>}
        </section>

        {/* ------------------------------------------------------ en directo */}
        {enDirecto && (
          <button
            type="button"
            onClick={() => navigate(`/event/${enDirecto.id}`)}
            className="press flex w-full items-center justify-between gap-3 rounded-2xl bg-party-primary p-4 text-left text-ink"
          >
            <span className="min-w-0">
              <LivePill className="mb-1" />
              <span className="block truncate font-display text-headline-md">{enDirecto.name}</span>
              <span className="text-body-sm text-ink/70">
                {t('venuePage.until', {
                  time: new Date(enDirecto.endDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
            </span>
            <span className="shrink-0 rounded-xl bg-ink px-3 py-2 font-display text-title-card text-party-primary">
              {t('venuePage.go')}
            </span>
          </button>
        )}

        {/* ---------------------------------------------------- descripción */}
        {venue.description && <p className="whitespace-pre-line text-body-md text-foreground/90">{venue.description}</p>}

        {/* --------------------------------------------------------- horario */}
        {venue.openingHours.length > 0 && (
          <section className="rounded-2xl bg-surface-low p-4">
            <h2 className="mb-1 flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
              <Clock size={16} className="text-party-primary" />
              {t('venuePage.hours')}
            </h2>
            {horarioHoy && (
              <p className="mb-2 text-body-sm text-party-gray">
                {horarioHoy.closed
                  ? t('venuePage.closedToday')
                  : t('venuePage.today', { hours: `${horarioHoy.open} – ${horarioHoy.close}` })}
              </p>
            )}
            <ul className="divide-y divide-white/[0.06]">{venue.openingHours.map(fila)}</ul>
          </section>
        )}

        {/* ------------------------------------------------------- ubicación */}
        {venue.latitude !== null && venue.longitude !== null && (
          <section className="flex items-center gap-3 rounded-2xl bg-surface-low p-3">
            <MapThumb latitude={venue.latitude} longitude={venue.longitude} className="shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-body-sm font-semibold">
                <MapPin size={15} className="shrink-0 text-party-primary" />
                <span className="line-clamp-2">{venue.address || venue.city || venue.name}</span>
              </p>
              <button
                type="button"
                onClick={() =>
                  void openExternal(
                    `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`,
                  )
                }
                className="press mt-2 flex items-center gap-1.5 rounded-lg bg-party-primary px-3 py-1.5 text-caption font-bold text-ink"
              >
                <Navigation size={14} />
                {t('venuePage.directions')}
              </button>
            </div>
          </section>
        )}

        {/* -------------------------------------------------------- contacto */}
        {(venue.phone || venue.contactEmail || venue.website || venue.instagram) && (
          <section className="flex flex-wrap gap-2">
            {venue.phone && (
              <button
                type="button"
                onClick={() => void openExternal(`tel:${venue.phone?.replace(/\s/g, '')}`)}
                className="press flex h-10 items-center gap-1.5 rounded-xl bg-surface-low px-3 text-caption font-bold"
              >
                <Phone size={14} />
                {venue.phone}
              </button>
            )}
            {venue.contactEmail && (
              <button
                type="button"
                onClick={() => void openExternal(`mailto:${venue.contactEmail}`)}
                className="press flex h-10 items-center gap-1.5 rounded-xl bg-surface-low px-3 text-caption font-bold"
              >
                <Mail size={14} />
                {t('venuePage.email')}
              </button>
            )}
            {venue.website && (
              <button
                type="button"
                onClick={() => void openExternal(venue.website as string)}
                className="press flex h-10 items-center gap-1.5 rounded-xl bg-surface-low px-3 text-caption font-bold"
              >
                <Globe size={14} />
                {t('venuePage.website')}
              </button>
            )}
            {venue.instagram && (
              <button
                type="button"
                onClick={() => void openExternal(`https://instagram.com/${venue.instagram}`)}
                className="press flex h-10 items-center gap-1.5 rounded-xl bg-surface-low px-3 text-caption font-bold"
              >
                <AtSign size={14} />
                {venue.instagram}
              </button>
            )}
          </section>
        )}

        {/* --------------------------------------------------------- eventos */}
        <section>
          <h2 className="mb-2 font-display text-headline-md">{t('venuePage.upcoming')}</h2>
          {proximos.length === 0 ? (
            <p className="text-body-sm text-party-gray">
              {venue.iFollow ? t('venuePage.noUpcomingFollowing') : t('venuePage.noUpcoming')}
            </p>
          ) : (
            <ul className="space-y-2">{proximos.map((e) => tarjeta(e))}</ul>
          )}
        </section>

        {pasados.length > 0 && (
          <section>
            <h2 className="mb-2 font-display text-headline-md">{t('venuePage.past')}</h2>
            <ul className="space-y-2">{pasados.map((e) => tarjeta(e, true))}</ul>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default VenuePage;
