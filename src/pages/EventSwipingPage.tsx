import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Camera,
  Crown,
  Heart,
  Image as ImageIcon,
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
import GroupsSheet from '@/components/groups-sheet';
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
import { User } from '@/types/user';

const REQUIRED_PHOTOS = 3;

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
  const { isPremium, setShowPremiumDialog } = usePremium();

  const [photos, setPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showMatchDialog, setShowMatchDialog] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [matchedUser, setMatchedUser] = useState<User | null>(null);
  const [dentro, setDentro] = useState<number | null>(null);
  const [misIntereses, setMisIntereses] = useState<string[]>([]);

  const tarjeta = useRef<ProfileCardHandle | null>(null);

  const extras = useNightExtras(activeEvent?.eventId ?? eventId ?? '', loadProfiles);

  // Dos cosas distintas: las fotos del perfil se piden una vez para verificar
  // la cuenta, y la foto del evento se pide en cada fiesta porque es la que se
  // ve al deslizar. Sin ella no se sale en el tablón de nadie.
  const needsPhotos = !currentUser?.isVerified || (currentUser?.photos.length ?? 0) === 0;
  const needsEventPhoto = !needsPhotos && !activeEvent?.photoUrl;

  const [step, setStep] = useState<'take_photos' | 'event_photo' | 'swipe'>(() =>
    needsPhotos ? 'take_photos' : 'swipe',
  );

  useEffect(() => {
    if (needsPhotos) return;
    setStep(needsEventPhoto ? 'event_photo' : 'swipe');
  }, [needsPhotos, needsEventPhoto]);

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

  /**
   * Carga una foto de la galería en la vista previa.
   *
   * Se convierte a data URL para que el resto del paso no tenga que distinguir
   * de dónde salió: la vista previa, el «repetir» y la subida funcionan igual
   * viniendo de la cámara o del carrete.
   */
  const pickEventPhotoFromGallery = useCallback(
    async (file: File) => {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        setEventPhoto(dataUrl);
      } catch {
        toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
      }
    },
    [toast, t],
  );

  /** Sube la foto de esta noche y entra al tablón. */
  const submitEventPhoto = useCallback(async () => {
    if (!eventPhoto || !activeEvent) return;

    setIsUploading(true);
    try {
      const blob = await api.dataUrlToBlob(eventPhoto);
      const result = await api.submitEventPhoto(activeEvent.eventId, blob);

      if (!result.published) {
        // La moderación devuelve un código, no una frase: `no_face`,
        // `many_faces`, `nudity`… Se traduce aquí para no mostrar jerga.
        const motivos: Record<string, string> = {
          no_face: t('swiping.rejectNoFace'),
          many_faces: t('swiping.rejectManyFaces'),
        };

        toast({
          title: t('common.error'),
          description: (result.reason && motivos[result.reason]) ?? t('swiping.eventPhotoRejected'),
          variant: 'destructive',
        });
        setEventPhoto(null);
        return;
      }

      track('photos_uploaded', { count: 1, kind: 'event' });
      await refreshActiveEvent();
      await loadProfiles();
      setStep('swipe');
    } catch (error) {
      console.error('Error uploading event photo:', error);
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [eventPhoto, activeEvent, refreshActiveEvent, loadProfiles, toast, t]);

  // El acceso lo garantiza ProtectedRoute; aquí sólo se comprueba que el evento
  // de la URL sea el que se ha canjeado.
  useEffect(() => {
    if (activeEvent && eventId && activeEvent.eventId !== eventId) {
      navigate(`/event/${eventId}/access`, { replace: true });
    }
  }, [activeEvent, eventId, navigate]);

  const handleCapture = useCallback((dataUrl: string) => {
    setPhotos((prev) => [...prev, dataUrl].slice(0, REQUIRED_PHOTOS));
    setShowCamera(false);
  }, []);

  const startSwiping = useCallback(async () => {
    if (photos.length < REQUIRED_PHOTOS) return;

    setIsUploading(true);
    try {
      // Las fotos van a Storage y pasan por moderación.
      const results = await Promise.all(
        photos.map(async (dataUrl, index) => {
          const blob = await api.dataUrlToBlob(dataUrl);
          return api.submitPhotoForReview(blob, `event-photo-${index + 1}.jpg`);
        }),
      );

      const rejected = results.find((r) => !r.published);
      if (rejected) {
        toast({
          title: t('common.error'),
          description: rejected.reason ?? t('errors.generic'),
          variant: 'destructive',
        });
        setPhotos([]);
        return;
      }

      track('photos_uploaded', { count: results.length });

      await api.refreshVerificationStatus();
      await refreshProfile();
      await loadProfiles();

      setStep('swipe');
    } catch (error) {
      console.error('Error uploading event photos:', error);
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [photos, refreshProfile, loadProfiles, toast, t]);

  const onSwipe = useCallback(
    async (direction: SwipeDirection, userId: string) => {
      const swiped = nearbyProfiles.find((p) => p.id === userId) ?? null;
      track('swipe', { direction });

      if (direction === 'left') {
        await handleSwipeLeft(userId);
        return;
      }

      const isMatch =
        direction === 'super' ? await handleSuperLike(userId) : await handleSwipeRight(userId);

      if (isMatch && swiped) {
        track('match', { eventId: activeEvent?.eventId });
        setMatchedUser(swiped);
        setShowMatchDialog(true);
      }
    },
    [nearbyProfiles, handleSwipeLeft, handleSwipeRight, handleSuperLike, activeEvent?.eventId],
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
  // Paso 1: fotos tomadas en el momento
  // -------------------------------------------------------------------------
  if (step === 'take_photos') {
    return (
      <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
        <Header />
        <main className="mx-auto w-full max-w-md px-margin pt-5">
          <PasoCabecera
            title={t('swiping.photosTitle', { name: activeEvent.eventName })}
            body={t('swiping.photosBody', { count: REQUIRED_PHOTOS })}
          />

          {showCamera ? (
            <CameraCapture
              onCapture={handleCapture}
              onCancel={() => setShowCamera(false)}
              facingMode="user"
              captureLabel={t('swiping.photoOf', { current: photos.length + 1, total: REQUIRED_PHOTOS })}
            />
          ) : (
            <>
              <div className="mb-5 grid grid-cols-3 gap-2">
                {Array.from({ length: REQUIRED_PHOTOS }).map((_, index) =>
                  photos[index] ? (
                    <img
                      key={index}
                      src={photos[index]}
                      alt=""
                      className="aspect-square w-full rounded-xl object-cover"
                    />
                  ) : (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-surface-highest bg-card text-party-gray"
                    >
                      <Camera size={22} />
                      <span className="text-caption">{t('swiping.takePhoto')}</span>
                    </button>
                  ),
                )}
              </div>

              {photos.length > 0 && (
                <button
                  type="button"
                  className="press mb-4 text-caption text-party-gray underline"
                  onClick={() => setPhotos([])}
                >
                  {t('swiping.startOver')}
                </button>
              )}

              {photos.length < REQUIRED_PHOTOS ? (
                <p className="text-body-sm text-party-gray">
                  {t('swiping.missingPhotos', { count: REQUIRED_PHOTOS - photos.length })}
                </p>
              ) : (
                <PartyButton
                  size="lg"
                  onClick={() => void startSwiping()}
                  className="w-full"
                  disabled={isUploading}
                >
                  {isUploading ? t('swiping.uploading') : t('swiping.startSwiping')}
                </PartyButton>
              )}
            </>
          )}
        </main>
        <Footer />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Paso 2: la foto de esta noche
  // -------------------------------------------------------------------------
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

                  {/* La foto de esta noche se hace con la cámara: es lo que la
                      hace valer algo. La galería es la excepción de pago, y
                      pasa por la misma moderación. */}
                  {isPremium ? (
                    <>
                      <input
                        id="event-photo-gallery"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (file) void pickEventPhotoFromGallery(file);
                        }}
                      />
                      <PartyButton asChild variant="outline" size="sm" className="cursor-pointer">
                        <label htmlFor="event-photo-gallery">
                          <ImageIcon size={14} />
                          {t('profile.fromGallery')}
                        </label>
                      </PartyButton>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowPremiumDialog(true)}
                      className="press mx-auto flex items-center justify-center gap-2 rounded-xl border border-dashed border-surface-highest px-4 py-2 text-caption text-party-gray"
                    >
                      <Crown size={14} className="text-party-accent" />
                      {t('profile.fromGalleryPremium')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
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
            <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-party-primary px-3 py-1.5 text-label-pill text-ink">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-ink" />
              <span className="truncate">{activeEvent.eventName}</span>
              {dentro !== null && dentro > 0 && (
                <span className="shrink-0">· {t('swiping.insideCount', { count: dentro })}</span>
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
        </div>

        {/* Acciones del evento en una fila que se desliza: son seis y en el
            ancho de un móvil no caben sin encoger hasta ser ilegibles. */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-margin py-3">
          <DiscoveryFiltersSheet filters={filters} onApply={setFilters} />
          <GroupsSheet eventId={activeEvent.eventId} />
          <EventOffers eventId={activeEvent.eventId} />
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
          <EventActionButton icon={LogOut} label={t('swiping.exitShort')} onClick={handleExit} tone="danger" />
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
              isPremium ? tarjeta.current?.swipe('super') : setShowPremiumDialog(true)
            }
            aria-label={t('premium.features.superLikes')}
            className="press flex h-12 w-12 items-center justify-center rounded-full bg-card text-party-primary shadow-lg disabled:opacity-40"
          >
            <Star size={21} className="fill-party-primary" />
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
