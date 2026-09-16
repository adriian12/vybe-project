import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AtSign, Heart, Loader2, Lock, Star, Zap } from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import ConnectionListItem from '@/components/connection-list-item';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { usePremium } from '@/context/premium-context';
import { api, ApiError } from '@/services/api';
import { LikeReceived, socialService } from '@/services/social';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';

const FALLBACK_PHOTO = '/placeholder.svg';

type Pestana = 'matches' | 'likes';

/**
 * «Mis Vybes», según la pantalla de Stitch: tus conexiones y quién te ha dado
 * like, en la misma pantalla y con un interruptor arriba.
 *
 * Antes eran dos pantallas y a «Les gustas» sólo se llegaba por un corazón
 * pequeño en la esquina de la otra, así que casi nadie sabía que existía.
 */
const VybesPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // `/matches` y `/likes` montan este mismo componente, así que al cambiar de
  // pestaña React lo conserva y no vuelve a pedir los likes.
  const initialTab: Pestana = pathname.startsWith('/likes') ? 'likes' : 'matches';
  const { toast } = useToast();
  const { connections, messages, currentUser, activeEvent, events } = useAppContext();
  const { isPremium, setShowPremiumDialog } = usePremium();

  const [pestana, setPestana] = useState<Pestana>(initialTab);
  const [likes, setLikes] = useState<LikeReceived[] | null>(null);
  const [likesLocked, setLikesLocked] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setPestana(initialTab), [initialTab]);

  const cambiar = (siguiente: Pestana) => {
    setPestana(siguiente);
    // La URL sigue a la pestaña para que «atrás» y los enlaces directos
    // lleven al mismo sitio.
    navigate(siguiente === 'likes' ? '/likes' : '/matches', { replace: true });
  };

  const cargarLikes = useCallback(async () => {
    try {
      setLikes(await socialService.getLikesReceived());
      setLikesLocked(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PREMIUM_REQUIRED') {
        setLikesLocked(true);
        setLikes([]);
      } else {
        setLikes([]);
      }
    }
  }, []);

  useEffect(() => {
    void cargarLikes();
  }, [cargarLikes, isPremium]);

  const ultimo = useCallback(
    (profileId: string) => {
      const conversacion = messages[profileId];
      if (!conversacion?.length) return null;
      return conversacion.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a));
    },
    [messages],
  );

  const sinLeer = useCallback(
    (profileId: string) =>
      (messages[profileId] ?? []).filter((m) => m.receiverId === currentUser?.id && !m.read).length,
    [messages, currentUser?.id],
  );

  /** Conexiones sin ningún mensaje todavía: van en la fila de caras de arriba. */
  const nuevas = useMemo(
    () =>
      connections
        .filter((c) => !messages[c.user.id]?.length)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [connections, messages],
  );

  const conversaciones = useMemo(
    () =>
      connections
        .filter((c) => messages[c.user.id]?.length)
        .sort((a, b) => {
          const ta = ultimo(a.user.id)?.createdAt ?? a.createdAt;
          const tb = ultimo(b.user.id)?.createdAt ?? b.createdAt;
          return new Date(tb).getTime() - new Date(ta).getTime();
        }),
    [connections, messages, ultimo],
  );

  const pendientes = conversaciones.filter((c) => sinLeer(c.user.id) > 0).length;
  const nombreEvento = (id?: string) => (id ? events.find((e) => e.id === id)?.name : undefined);

  const likeBack = async (profileId: string) => {
    setBusyId(profileId);
    try {
      const isMatch = await api.swipe(profileId, 'like', activeEvent?.eventId);
      setLikes((prev) => (prev ?? []).filter((l) => l.id !== profileId));
      if (isMatch) {
        track('match', { from: 'likes' });
        toast({ title: t('match.newConnection') });
        navigate(`/chat/${profileId}`);
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const bloqueados = likesLocked || !isPremium;

  return (
    <div className="min-h-screen pb-28 pt-16">
      <Header />

      <main className="mx-auto max-w-md space-y-6 px-margin pt-4">
        {/* ------------------------------------------------------ interruptor */}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-card p-1.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={pestana === 'matches'}
            onClick={() => cambiar('matches')}
            className={cn(
              'press flex h-12 items-center justify-center gap-2 rounded-full font-display text-title-card uppercase',
              pestana === 'matches' ? 'bg-party-primary text-ink' : 'text-party-gray',
            )}
          >
            <Heart size={18} />
            {t('vybes.matches', { count: connections.length })}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pestana === 'likes'}
            onClick={() => cambiar('likes')}
            className={cn(
              'press flex h-12 items-center justify-center gap-2 rounded-full font-display text-title-card uppercase',
              pestana === 'likes' ? 'bg-party-primary text-ink' : 'text-party-gray',
            )}
          >
            {bloqueados ? <Lock size={17} className={pestana === 'likes' ? '' : 'text-party-primary'} /> : <Star size={17} />}
            {t('likes.title')}
            {likes && likes.length > 0 && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-caption',
                  pestana === 'likes' ? 'bg-ink text-party-primary' : 'bg-surface-high text-party-primary',
                )}
              >
                {likes.length}
              </span>
            )}
          </button>
        </div>

        {pestana === 'matches' ? (
          <>
            {/* ------------------------------------------- nuevas conexiones */}
            {nuevas.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-display text-headline-md uppercase tracking-wide">
                    <span className="h-2.5 w-2.5 rounded-full bg-party-primary" />
                    {t('vybes.newConnections')}
                  </h2>
                  {activeEvent && (
                    <span className="truncate text-label-pill uppercase text-party-primary">
                      {t('vybes.atEvent', { name: activeEvent.eventName })}
                    </span>
                  )}
                </div>
                <div className="no-scrollbar -mx-margin flex gap-4 overflow-x-auto px-margin pb-1">
                  {nuevas.map((c, i) => (
                    <button
                      key={c.connectionId}
                      type="button"
                      onClick={() => navigate(`/u/${c.user.id}`)}
                      className="press flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5"
                    >
                      <span className="relative">
                        <span className="block h-[4.5rem] w-[4.5rem] rounded-full bg-party-primary p-[3px]">
                          <img
                            src={c.user.photos[0] || c.user.avatar || FALLBACK_PHOTO}
                            alt=""
                            className="h-full w-full rounded-full border-2 border-background object-cover"
                          />
                        </span>
                        {i === 0 && (
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-party-primary px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                            {t('vybes.new')}
                          </span>
                        )}
                      </span>
                      <span className="w-full truncate text-center text-body-sm">{c.user.name}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ------------------------------------------------------ aviso */}
            {connections.some((c) => c.expiresAt) && (
              <div className="flex items-center gap-3 rounded-2xl bg-card p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-party-primary/20 text-party-primary">
                  <Zap size={20} />
                </span>
                <p className="text-body-md text-[#C8C6C5]">
                  {t('vybes.expireNotice')} <strong className="text-white">{t('vybes.expireCta')}</strong>
                </p>
              </div>
            )}

            {/* ------------------------------------------------ conversaciones */}
            {connections.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-12 text-center">
                <Zap size={40} className="mb-3 text-party-primary" />
                <h2 className="font-display text-headline-md">{t('matches.empty')}</h2>
                <p className="mb-5 mt-1 max-w-xs text-body-sm text-party-gray">{t('matches.emptyBody')}</p>
                <PartyButton onClick={() => navigate('/home')}>{t('tickets.explore')}</PartyButton>
              </div>
            ) : (
              conversaciones.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-display text-headline-lg">{t('vybes.activeChats')}</h2>
                    {pendientes > 0 && (
                      <span className="text-body-sm text-party-gray">
                        {t('vybes.pending', { count: pendientes })}
                      </span>
                    )}
                  </div>
                  <div className="stagger space-y-3">
                    {conversaciones.map((c, i) => {
                      const msg = ultimo(c.user.id);
                      const propio = msg?.senderId === currentUser?.id;
                      return (
                        <div key={c.connectionId} style={{ '--i': Math.min(i, 8) } as React.CSSProperties}>
                          <ConnectionListItem
                            connection={c}
                            lastMessage={msg ? `${propio ? t('matches.you') : ''}${msg.content}` : undefined}
                            lastAt={msg?.createdAt}
                            unreadCount={sinLeer(c.user.id)}
                            eventName={nombreEvento(c.eventId)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              )
            )}
          </>
        ) : likes === null ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
          </div>
        ) : bloqueados ? (
          <div className="flex flex-col items-center rounded-2xl bg-party-primary px-6 py-10 text-center text-ink">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-party-primary">
              <Lock size={26} />
            </span>
            <h2 className="font-display text-headline-lg">{t('likes.locked')}</h2>
            <p className="mb-6 mt-1 max-w-xs text-body-md text-ink/75">{t('likes.lockedBody')}</p>
            <button
              type="button"
              onClick={() => setShowPremiumDialog(true)}
              className="press h-12 rounded-xl bg-ink px-6 font-bold text-party-primary"
            >
              {t('likes.unlock')}
            </button>
          </div>
        ) : likes.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl bg-card px-6 py-12 text-center">
            <Heart size={40} className="mb-3 text-party-primary" />
            <h2 className="font-display text-headline-md">{t('likes.empty')}</h2>
            <p className="mt-1 max-w-xs text-body-sm text-party-gray">{t('likes.emptyBody')}</p>
          </div>
        ) : (
          <>
            <p className="text-body-md text-party-gray">{t('likes.subtitle')}</p>
            <ul className="grid grid-cols-2 gap-3">
              {likes.map((like) => (
                <li key={like.id} className="overflow-hidden rounded-2xl bg-white text-ink">
                  <div className="relative aspect-[4/5]">
                    <img
                      src={like.photos[0] || like.avatar || FALLBACK_PHOTO}
                      alt={like.name}
                      className="h-full w-full object-cover"
                    />
                    {like.swipeType === 'super_like' && (
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-party-primary px-2 py-0.5 text-label-pill text-ink">
                        <Star size={11} />
                        Super
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate font-display text-title-card">
                      {like.name}, {like.age}
                    </p>
                    {like.eventName && (
                      <p className="mb-2 truncate text-caption text-ink/55">
                        {t('likes.at', { event: like.eventName })}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={busyId === like.id}
                      onClick={() => void likeBack(like.id)}
                      className="press flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-party-primary text-sm font-bold text-ink disabled:opacity-50"
                    >
                      <Heart size={14} />
                      {t('likes.likeBack')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      {/* Volver a buscar gente: a la fiesta si estás dentro, a la lista si no. */}
      <button
        type="button"
        onClick={() => navigate(activeEvent ? `/event/${activeEvent.eventId}/live` : '/home')}
        className="press fixed bottom-20 right-margin z-20 flex h-14 items-center gap-2 rounded-full bg-party-primary px-6 font-display text-title-card text-ink shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      >
        <AtSign size={20} />
        {t('vybes.backToExplore')}
      </button>

      <Footer />
    </div>
  );
};

export default VybesPage;
