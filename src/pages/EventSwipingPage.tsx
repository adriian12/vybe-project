import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Camera,
  Heart,
  Loader2,
  LogOut,
  Radar,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldAlert,
  Star,
  Users,
  X,
} from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { PartyButton } from '@/components/ui-custom/party-button';
import ProfileCard, { ProfileCardHandle, SwipeDirection } from '@/components/profile-card';
import MatchDialog from '@/components/match-dialog';
import CameraCapture from '@/components/camera-capture';
import DiscoveryFiltersSheet from '@/components/discovery-filters';
import SafetySheet from '@/components/safety-sheet';
import EventOffers from '@/components/event-offers';
import { useNightExtras } from '@/components/night-extras';
import { EventActionButton } from '@/components/ui-custom/event-action-button';
import { useAppContext } from '@/context/app-context';
import { usePremium } from '@/context/premium-context';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/services/api';
import { socialService } from '@/services/social';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';
import FollowVenuePrompt from '@/components/follow-venue-prompt';
import GuestEventPage from '@/pages/GuestEventPage';
import PhotoRequirementsDialog, { FailedPhoto } from '@/components/photo-requirements-dialog';
import { User } from '@/types/user';

/** Cabecera común de los pasos previos al tablón. */
const PasoCabecera: React.FC<{ title: string; body: string }> = ({ title, body }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={t('common.back')}
        className="press mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-card"
      >
        <ArrowLeft size={20} />
      </button>
      <h1 className="font-display text-headline-xl">{title}</h1>
      <p className="mt-1 text-body-md text-party-gray">{body}</p>
    </div>
  );
};

const EventSwipingPage = () => {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  const {
    activeEvent,
    currentUser,
    currentProfile,
    nearbyProfiles,
    filters,
    setFilters,
    handleSwipeLeft,
    handleSwipeRight,
    handleSuperLike,
    loadProfiles,
    refreshProfile,
    refreshActiveEvent,
    leaveEvent,
  } = useAppContext();
  const { supercrushBalance, supercrushIncluded, setShowSupercrushDialog, refreshSupercrush } =
    usePremium();
  // Supercrush que puede mandar ahora: el incluido de Premium en esta fiesta
  // más los comprados o regalados.
  const supercrushDisponibles = supercrushBalance + (supercrushIncluded ? 1 : 0);

  const [fallidas, setFallidas] = useState<{ items: FailedPhoto[]; total: number; kind: 'profile' | 'event' }>({
    items: [],
    total: 1,
    kind: 'profile',
  });
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [matchedUser, setMatchedUser] = useState<User | null>(null);
  const [dentro, setDentro] = useState<number | null>(null);
  const [misIntereses, setMisIntereses] = useState<string[]>([]);

  const tarjeta = useRef<ProfileCardHandle | null>(null);

  const extras = useNightExtras(activeEvent?.eventId ?? eventId ?? '', loadProfiles);

  // Cómo se entra a la fiesta lo dice el tipo de cuenta; un vyber puede pasar
  // esa noche suelta a invitado con el botón de la barra de acciones.
  const modo: 'vyber' | 'guest' =
    activeEvent?.mode ?? (currentUser?.accountType === 'guest' ? 'guest' : 'vyber');

  // Una sola foto al entrar: la de esta noche, hecha con la cámara (cara o
  // cuerpo entero). La revisión automática la aprueba y, si la cuenta aún no
  // estaba verificada, la verifica con ella. Antes se pedían tres fotos de
  // perfil y luego otra más para el evento.
  const [step, setStep] = useState<'event_photo' | 'swipe'>(() =>
    activeEvent?.photoUrl ? 'swipe' : 'event_photo',
  );

  useEffect(() => {
    setStep(activeEvent?.photoUrl ? 'swipe' : 'event_photo');
  }, [activeEvent?.photoUrl]);

  const [eventPhoto, setEventPhoto] = useState<string | null>(null);

  // Cuánta gente hay dentro, para la píldora de arriba. Se refresca cada
  // minuto: es lo que dice si merece la pena seguir deslizando.
  useEffect(() => {
    if (!activeEvent) return;
    let vivo = true;
    const leer = () =>
      socialService.getEventsActivity([activeEvent.eventId]).then((data) => {
        if (vivo) setDentro(data[activeEvent.eventId]?.inside ?? null);
      });
    void leer();
    const reloj = setInterval(() => void leer(), 60_000);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [activeEvent]);

  useEffect(() => {
    void socialService.getMyInterests().then(setMisIntereses);
  }, []);

  /** Sube la foto de esta noche y entra al tablón. */
  const submitEventPhoto = useCallback(async () => {
    if (!eventPhoto || !activeEvent) return;

    setIsUploading(true);
    try {
      const blob = await api.dataUrlToBlob(eventPhoto);
      const result = await api.submitEventPhoto(activeEvent.eventId, blob);

      if (!result.published) {
        setFallidas({ items: [{ index: 1, reason: result.reason }], total: 1, kind: 'event' });
        setEventPhoto(null);
        return;
      }

      track('photos_uploaded', { count: 1, kind: 'event' });
      await api.refreshVerificationStatus();
      await refreshProfile();
      await refreshActiveEvent();
      await loadProfiles();
      setStep('swipe');
    } catch (error) {
      console.error('Error uploading event photo:', error);
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [eventPhoto, activeEvent, refreshActiveEvent, refreshProfile, loadProfiles, toast, t]);

  // El acceso lo garantiza ProtectedRoute; aquí sólo se comprueba que el evento
  // de la URL sea el que se ha canjeado.
  useEffect(() => {
    if (activeEvent && eventId && activeEvent.eventId !== eventId) {
      navigate(`/event/${eventId}/access`, { replace: true });
    }
  }, [activeEvent, eventId, navigate]);


  const onSwipe = useCallback(
    async (direction: SwipeDirection, userId: string) => {
      const swiped = nearbyProfiles.find((p) => p.id === userId) ?? null;
      track('swipe', { direction });

      if (direction === 'left') {
        await handleSwipeLeft(userId);
        return;
      }

      const isMatch =
        direction === 'super'
          ? await handleSuperLike(userId).finally(() => void refreshSupercrush())
          : await handleSwipeRight(userId);

      if (isMatch && swiped) {
        track('match', { eventId: activeEvent?.eventId });
        setMatchedUser(swiped);
        setShowMatchDialog(true);
      }
    },
    [nearbyProfiles, handleSwipeLeft, handleSwipeRight, handleSuperLike, refreshSupercrush, activeEvent?.eventId],
  );

  const handleExit = () => {
    leaveEvent();
    navigate('/home');
  };

  if (!activeEvent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Antes del tablón: la foto de esta noche
  // -------------------------------------------------------------------------
  if (modo === 'guest') {
    return <GuestEventPage />;
  }

  if (step === 'event_photo') {
    return (
      <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
        <Header />
        <main className="mx-auto w-full max-w-md px-margin pt-5">
          <PasoCabecera title={t('swiping.eventPhotoTitle')} body={t('swiping.eventPhotoBody')} />

          {showCamera ? (
            <CameraCapture
              onCapture={(dataUrl) => {
                setEventPhoto(dataUrl);
                setShowCamera(false);
              }}
              onCancel={() => setShowCamera(false)}
              facingMode="user"
              captureLabel={t('swiping.eventPhotoCapture')}
            />
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-6 flex aspect-[3/4] w-full max-w-[16rem] items-center justify-center overflow-hidden rounded-[20px] bg-card">
                {eventPhoto ? (
                  <img src={eventPhoto} alt="" className="h-full w-full object-cover" />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="press flex h-full w-full flex-col items-center justify-center gap-3 text-party-gray"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-party-primary text-ink">
                      <Camera size={28} />
                    </span>
                    <span className="text-body-md">{t('swiping.takePhoto')}</span>
                  </button>
                )}
              </div>

              {eventPhoto ? (
                <div className="space-y-3">
                  <PartyButton
                    size="lg"
                    className="w-full"
                    disabled={isUploading}
                    onClick={() => void submitEventPhoto()}
                  >
                    {isUploading ? t('swiping.uploading') : t('swiping.startSwiping')}
                  </PartyButton>
                  <button
                    type="button"
                    className="press text-caption text-party-gray underline"
                    onClick={() => setEventPhoto(null)}
                  >
                    {t('swiping.retakePhoto')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-caption text-party-gray">{t('swiping.eventPhotoWhy')}</p>

                  {/* La foto de esta noche se hace con la cámara, siempre: es lo
                      que la hace valer algo. La galería sólo sirve para el
                      perfil. */}
                  <p className="text-caption text-party-gray">{t('swiping.cameraOnly')}</p>
                </div>
              )}
            </div>
          )}
        </main>
        <PhotoRequirementsDialog
          open={fallidas.items.length > 0}
          onOpenChange={(open) => !open && setFallidas((f) => ({ ...f, items: [] }))}
          failed={fallidas.items}
          total={fallidas.total}
          kind={fallidas.kind}
        />
        <Footer />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Paso 3: el tablón
  // -------------------------------------------------------------------------
  const siguientes = nearbyProfiles.filter((p) => p.id !== currentProfile?.id).slice(0, 2);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden pb-[var(--nav-h)] pt-[var(--header-h)]">
      <Header />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
        {/* ------------------------------------------------ barra del evento */}
        <div className="flex items-center gap-2 px-margin pt-3">
          <button
            type="button"
            onClick={() => navigate('/home')}
            aria-label={t('common.back')}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex min-w-0 flex-1 justify-center">
            <span className="flex min-w-0 items-center gap-2 rounded-full bg-party-primary px-4 py-2.5 font-display text-title-card text-ink">
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-ink" />
              <span className="truncate">{activeEvent.eventName}</span>
              {dentro !== null && dentro > 0 && (
                <span className="shrink-0 text-body-sm font-bold">· {t('swiping.insideCount', { count: dentro })}</span>
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSafety(true)}
            aria-label={t('safety.shortTitle')}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-foreground"
          >
            <ShieldAlert size={19} />
          </button>
          {/* Salir, siempre a la vista: antes se perdía al final de la fila de
              acciones, que se desliza. */}
          <button
            type="button"
            onClick={handleExit}
            aria-label={t('swiping.exitShort')}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"
          >
            <LogOut size={18} />
          </button>
        </div>

        {/* Acciones del evento en una fila que se desliza: son seis y en el
            ancho de un móvil no caben sin encoger hasta ser ilegibles. */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-margin py-3">
          <DiscoveryFiltersSheet filters={filters} onApply={setFilters} />
          <EventOffers eventId={activeEvent.eventId} />
          {activeEvent.venueId && (
            <FollowVenuePrompt venueId={activeEvent.venueId} venueName={activeEvent.venueName ?? activeEvent.eventName} />
          )}
          <EventActionButton
            icon={Rocket}
            label={
              extras.boostMinutes > 0
                ? t('premium.boost.active', { minutes: extras.boostMinutes })
                : t('premium.boost.cta')
            }
            onClick={() => void extras.startBoost()}
            disabled={extras.boosting || extras.boostMinutes > 0}
            tone={extras.boostMinutes > 0 ? 'active' : 'default'}
          />
        </div>

        {/* ----------------------------------------------------------- baraja */}
        <main className="relative mx-margin flex-1">
          {currentProfile ? (
            <>
              {/* Las dos siguientes asoman detrás, giradas, para que se lea que
                  hay más gente sin tener que deslizar. */}
              {siguientes.map((perfil, i) => (
                <div
                  key={perfil.id}
                  aria-hidden
                  className={cn(
                    'absolute inset-0 overflow-hidden rounded-[20px] bg-surface-high',
                    i === 0 ? 'translate-y-2 rotate-[2.5deg] scale-[0.96] opacity-70' : '-translate-y-1 -rotate-[3deg] scale-[0.92] opacity-40',
                  )}
                >
                  <img
                    src={perfil.photos[0] ?? perfil.avatar ?? '/placeholder.svg'}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
              <ProfileCard
                ref={tarjeta}
                user={currentProfile}
                onSwipe={(direction, userId) => void onSwipe(direction, userId)}
              />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-[20px] bg-card p-8 text-center">
              <Users size={44} className="mb-4 text-party-primary" />
              <h2 className="font-display text-headline-lg">{t('swiping.noMoreTitle')}</h2>
              <p className="mb-6 mt-2 max-w-xs text-body-md text-party-gray">
                {t('swiping.noMoreBody', { name: activeEvent.eventName })}
              </p>
              <PartyButton variant="outline" onClick={() => void loadProfiles()}>
                <RefreshCw size={16} />
                {t('swiping.searchAgain')}
              </PartyButton>
            </div>
          )}
        </main>

        {/* ------------------------------------------------------- decisiones */}
        <div className="flex items-center justify-center gap-4 px-margin pb-2 pt-4">
          <button
            type="button"
            disabled={!currentProfile}
            onClick={() => tarjeta.current?.swipe('left')}
            aria-label={t('swiping.pass')}
            className="press flex h-16 w-16 items-center justify-center rounded-full bg-card text-party-gray shadow-lg disabled:opacity-40"
          >
            <X size={30} />
          </button>
          <button
            type="button"
            onClick={() => void extras.openSecondChance()}
            aria-label={t('premium.secondChance.cta')}
            className="press flex h-12 w-12 items-center justify-center rounded-full bg-card text-party-primary shadow-lg"
          >
            <RotateCcw size={21} />
          </button>
          <button
            type="button"
            disabled={!currentProfile}
            onClick={() =>
              supercrushDisponibles > 0 ? tarjeta.current?.swipe('super') : setShowSupercrushDialog(true)
            }
            aria-label={t('supercrush.send', { count: supercrushDisponibles })}
            className="press relative flex h-12 w-12 items-center justify-center rounded-full bg-card text-party-primary shadow-lg disabled:opacity-40"
          >
            <Star size={21} className="fill-party-primary" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-party-primary px-1 text-[11px] font-bold text-ink">
              {supercrushDisponibles > 0 ? supercrushDisponibles : '+'}
            </span>
          </button>
          <button
            type="button"
            disabled={!currentProfile}
            onClick={() => tarjeta.current?.swipe('right')}
            aria-label={t('likes.likeBack')}
            className="press flex h-16 w-16 items-center justify-center rounded-full bg-party-primary text-ink shadow-[0_8px_24px_rgba(248,208,0,0.25)] disabled:opacity-40"
          >
            <Heart size={30} className="fill-ink" />
          </button>
        </div>

        <p className="flex items-center justify-center gap-1.5 px-margin pb-3 text-center text-caption text-party-gray">
          <Radar size={13} className="shrink-0 text-party-primary" />
          {t('swiping.onlyHere')}
        </p>
      </div>

      <Footer />

      {extras.secondChanceSheet}

      <MatchDialog
        isOpen={showMatchDialog}
        onClose={() => setShowMatchDialog(false)}
        matchedUser={matchedUser}
        currentUserPhoto={activeEvent.photoUrl ?? currentUser?.photos[0]}
        eventName={activeEvent.eventName}
        endsAt={activeEvent.endDate}
        myInterests={misIntereses}
        onSendMessage={() => {
          if (matchedUser) navigate(`/chat/${matchedUser.id}`);
        }}
        onViewProfile={() => {
          if (matchedUser) navigate(`/u/${matchedUser.id}`);
        }}
      />

      <SafetySheet open={showSafety} onOpenChange={setShowSafety} />
    </div>
  );
};

export default EventSwipingPage;
