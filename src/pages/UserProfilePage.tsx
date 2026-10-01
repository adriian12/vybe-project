import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Ban,
  BadgeCheck,
  CalendarHeart,
  Clock,
  Flag,
  Languages,
  MapPin,
  MessageSquare,
  MoreVertical,
  Music2,
  UserX,
  Zap,
} from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import ReportUserDialog from '@/components/report-user-dialog';
import { useInterestLabel } from '@/components/interest-picker';
import { PartyButton } from '@/components/ui-custom/party-button';
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
import { useAppContext } from '@/context/app-context';
import { formatDistance } from '@/services/geo';
import { Reputation, socialService } from '@/services/social';
import { cn } from '@/lib/utils';

const FALLBACK_PHOTO = '/placeholder.svg';

/** «hace 3 min», «hace 2 h», «hace 4 d». */
const hace = (iso: string, t: (k: string, o?: Record<string, unknown>) => string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.max(Math.floor(diff / 60_000), 1);
  if (min < 60) return t('userProfile.agoMinutes', { count: min });
  const h = Math.floor(min / 60);
  if (h < 48) return t('userProfile.agoHours', { count: h });
  return t('userProfile.agoDays', { count: Math.floor(h / 24) });
};

/**
 * El perfil de alguien con quien has conectado, según «Perfil de Lucía Farré
 * (Match)» de Stitch.
 *
 * Sólo se abre para tus conexiones y para quien está en tu tablón ahora mismo:
 * la aplicación no tiene un buscador de perfiles y no debe tenerlo, porque
 * sacaría a la gente del contexto de la fiesta en la que decidió dejarse ver.
 */
const UserProfilePage = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const interestLabel = useInterestLabel();
  const { connections, nearbyProfiles, activeEvent, events, blockUser } = useAppContext();

  const [foto, setFoto] = useState(0);
  const [misIntereses, setMisIntereses] = useState<string[]>([]);
  const [reputacion, setReputacion] = useState<Reputation | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showBlock, setShowBlock] = useState(false);

  const conexion = connections.find((c) => c.user.id === userId);
  const persona = conexion?.user ?? nearbyProfiles.find((p) => p.id === userId);

  useEffect(() => {
    void socialService.getMyInterests().then(setMisIntereses);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let vivo = true;
    void socialService.getReputation(userId).then((r) => {
      if (vivo) setReputacion(r);
    });
    return () => {
      vivo = false;
    };
  }, [userId]);

  const fotos = useMemo(() => {
    if (!persona) return [];
    const lista = persona.photos.length > 0 ? persona.photos : [persona.avatar ?? FALLBACK_PHOTO];
    return lista.filter(Boolean) as string[];
  }, [persona]);

  if (!persona) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <UserX size={44} className="text-party-gray" />
        <h1 className="font-display text-headline-lg">{t('userProfile.notFound')}</h1>
        <p className="max-w-xs text-body-md text-party-gray">{t('userProfile.notFoundBody')}</p>
        <PartyButton onClick={() => navigate('/matches')}>{t('chat.backToMatches')}</PartyButton>
      </div>
    );
  }

  const comunes = (persona.interests ?? []).filter((s) => misIntereses.includes(s));
  const resto = (persona.interests ?? []).filter((s) => !misIntereses.includes(s));
  const enLaFiesta = Boolean(activeEvent && (!conexion || conexion.eventId === activeEvent.eventId));
  const evento = conexion?.eventId ? events.find((e) => e.id === conexion.eventId) : undefined;
  const lugar = enLaFiesta ? activeEvent?.venueName : evento?.venueName;

  const bloquear = async () => {
    setShowBlock(false);
    if (await blockUser(persona.id)) navigate('/matches', { replace: true });
  };

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+7rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto max-w-md space-y-5 px-margin pt-4">
        {/* ----------------------------------------------------------- fotos */}
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-surface-high">
          <img src={fotos[foto] ?? FALLBACK_PHOTO} alt={persona.name} className="h-full w-full object-cover" />

          {/* Mitad izquierda, foto anterior; mitad derecha, siguiente. */}
          {fotos.length > 1 && (
            <>
              <button
                type="button"
                aria-label={t('userProfile.prevPhoto')}
                onClick={() => setFoto((f) => Math.max(f - 1, 0))}
                className="absolute inset-y-0 left-0 w-1/2"
              />
              <button
                type="button"
                aria-label={t('userProfile.nextPhoto')}
                onClick={() => setFoto((f) => Math.min(f + 1, fotos.length - 1))}
                className="absolute inset-y-0 right-0 w-1/2"
              />
            </>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-4">
            {fotos.length > 1 && (
              <div className="mb-3 flex gap-1.5">
                {fotos.map((_, i) => (
                  <span
                    key={i}
                    className={cn('h-1 flex-1 rounded-full', i === foto ? 'bg-party-primary' : 'bg-white/25')}
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {enLaFiesta && activeEvent && (
                <span className="flex items-center gap-1.5 rounded-full bg-[#0E0E11]/75 px-3 py-1 text-caption text-white backdrop-blur-sm">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {t('userProfile.atEventNow', { name: activeEvent.eventName })}
                </span>
              )}
              {(persona.faceVerified || persona.isVerified) && (
                <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[#0E0E11]/75 px-3 py-1 text-caption text-white backdrop-blur-sm">
                  <BadgeCheck size={14} className="text-party-primary" />
                  {t('userProfile.verified')}
                </span>
              )}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-4">
            {comunes.length > 0 ? (
              <span className="flex items-center gap-2">
                <span className="rounded-lg bg-party-primary px-3 py-1.5 font-display text-headline-md font-black text-ink">
                  {comunes.length}
                </span>
                <span className="text-label-pill uppercase tracking-wider text-party-primary">
                  {t('userProfile.inCommon', { count: comunes.length })}
                </span>
              </span>
            ) : (
              <span />
            )}
            {fotos.length > 1 && (
              <span className="rounded-md bg-[#0E0E11]/75 px-2 py-0.5 text-caption text-white">
                {foto + 1} / {fotos.length}
              </span>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------- nombre */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-baseline gap-2 font-display text-headline-xl">
              <span className="truncate">{persona.name}</span>
              <span className="shrink-0 text-headline-lg font-bold text-party-gray">{persona.age}</span>
            </h1>
            {lugar && (
              <p className="mt-1 flex items-center gap-1.5 text-body-md text-party-gray">
                <MapPin size={16} className="shrink-0 text-party-primary" />
                <span className="truncate">{lugar}</span>
              </p>
            )}
          </div>
          {persona.distance !== undefined && (
            <div className="shrink-0 text-right">
              <p className="text-caption text-party-gray">{t('userProfile.radar')}</p>
              <p className="font-display text-headline-md text-party-primary">{formatDistance(persona.distance)}</p>
            </div>
          )}
        </div>

        {persona.bio && (
          <p className="rounded-2xl bg-card p-4 text-body-md leading-relaxed">{persona.bio}</p>
        )}

        {/* ------------------------------------------------------- intereses */}
        {(comunes.length > 0 || resto.length > 0) && (
          <section className="space-y-3">
            <h2 className="flex items-center justify-between text-label-pill text-sm uppercase tracking-wider text-[#C8C6C5]">
              {t('userProfile.tastes')}
              <Music2 size={18} className="text-party-primary" />
            </h2>
            <div className="flex flex-wrap gap-2">
              {comunes.map((slug) => (
                <span key={slug} className="rounded-full bg-party-primary px-4 py-2 text-sm font-bold text-ink">
                  {interestLabel(slug)}
                </span>
              ))}
              {resto.map((slug) => (
                <span key={slug} className="rounded-full bg-surface-high px-4 py-2 text-sm font-semibold">
                  {interestLabel(slug)}
                </span>
              ))}
            </div>
          </section>
        )}

        {persona.planTonight && (
          <div className="flex items-center gap-4 rounded-2xl bg-card p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-party-primary">
              <Clock size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-body-sm text-party-gray">{t('profile.planTonight')}</p>
              <p className="font-display text-title-card">{persona.planTonight}</p>
            </div>
          </div>
        )}

        {persona.languages && persona.languages.length > 0 && (
          <div className="flex items-center gap-4 rounded-2xl bg-card p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-party-primary">
              <Languages size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-body-sm text-party-gray">{t('profile.languagesSpoken')}</p>
              <p className="font-display text-title-card uppercase">{persona.languages.join(' · ')}</p>
            </div>
          </div>
        )}

        {reputacion && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-card p-3 text-center">
              <p className="font-display text-headline-lg">{reputacion.eventsAttended}</p>
              <p className="flex items-center justify-center gap-1 text-caption text-party-gray">
                <CalendarHeart size={13} />
                {t('userProfile.nights')}
              </p>
            </div>
            <div className="rounded-2xl bg-card p-3 text-center">
              <p className="font-display text-headline-lg">{reputacion.connectionsMade}</p>
              <p className="flex items-center justify-center gap-1 text-caption text-party-gray">
                <Zap size={13} />
                {t('userProfile.vybes')}
              </p>
            </div>
          </div>
        )}

        {conexion && (
          <div className="rounded-2xl bg-card p-4">
            <p className="flex items-center gap-2 font-display text-headline-md">
              <Zap size={20} className="text-party-primary" />
              {t('userProfile.connectedTitle')}
            </p>
            <p className="mt-2 text-body-md text-party-gray">
              {t('userProfile.connectedAgo', { ago: hace(conexion.createdAt, t) })}
              {evento ? ` ${t('userProfile.connectedAt', { venue: evento.venueName ?? evento.name })}` : ''}{' '}
              {conexion.expiresAt
                ? t('userProfile.expiresAt', {
                    time: new Date(conexion.expiresAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })
                : t('userProfile.kept')}
            </p>
          </div>
        )}
      </main>

      {/* --------------------------------------------------- acciones abajo */}
      <div className="fixed inset-x-0 bottom-[var(--nav-h)] z-20 bg-background/95 px-margin py-3 backdrop-blur-lg">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button
            type="button"
            onClick={() => setShowReport(true)}
            aria-label={t('chat.report')}
            className="press flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-card text-party-primary"
          >
            <Flag size={22} />
          </button>
          {conexion ? (
            <button
              type="button"
              onClick={() => navigate(`/chat/${persona.id}`)}
              className="press flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-party-primary font-display text-headline-md text-ink"
            >
              {t('userProfile.openChat')}
              <MessageSquare size={22} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="press flex h-14 flex-1 items-center justify-center rounded-2xl bg-party-primary font-display text-headline-md text-ink"
            >
              {t('userProfile.backToDeck')}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t('chat.options')}
              className="press flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-card"
            >
              <MoreVertical size={22} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowReport(true)}>
                <Flag size={16} className="mr-2" />
                {t('chat.report')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowBlock(true)} className="text-destructive focus:text-destructive">
                <Ban size={16} className="mr-2" />
                {t('chat.block')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Footer />

      <ReportUserDialog
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        userId={persona.id}
        userName={persona.name}
      />

      <AlertDialog open={showBlock} onOpenChange={setShowBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.blockTitle', { name: persona.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('chat.blockBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void bloquear()}>{t('chat.block')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserProfilePage;
