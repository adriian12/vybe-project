import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Bell,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Crown,
  EyeOff,
  Globe,
  History,
  IdCard,
  Image as ImageIcon,
  Images,
  Loader2,
  LockKeyhole,
  LogOut,
  Trash2,
  Pencil,
  Plus,
  Shield,
  ShieldAlert,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useAppContext } from '@/context/app-context';
import { usePremium } from '@/context/premium-context';
import { PartyButton } from '@/components/ui-custom/party-button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import Header from '@/components/header';
import Footer from '@/components/footer';
import CameraCapture from '@/components/camera-capture';
import FaceVerification from '@/components/face-verification';
import InterestPicker, { useInterestLabel } from '@/components/interest-picker';
import SafetySheet from '@/components/safety-sheet';
import PrivacySheet from '@/components/privacy-sheet';
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
import Flag from '@/components/ui-custom/flag';
import { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';
import { api } from '@/services/api';
import { socialService, Interest, Reputation } from '@/services/social';
import { pushService, PushStatus } from '@/services/push';
import { cn } from '@/lib/utils';
import PhotoRequirementsDialog, { FailedPhoto } from '@/components/photo-requirements-dialog';
import AccountTypeCard from '@/components/account-type-card';
import { Input } from '@/components/ui/input';
import { privacyService } from '@/services/privacy';
import { track } from '@/lib/observability';

const MAX_PHOTOS = 6;

/** Campo claro para editar dentro de una tarjeta blanca. */
const campoClaro =
  'w-full rounded-xl border-[1.5px] border-black/10 bg-black/[0.04] px-3 py-2.5 text-body-md text-ink outline-none placeholder:text-ink/40 focus:border-party-primary';

/** Una fila del bloque de ajustes: icono en círculo, texto y lo que vaya a la derecha. */
const Fila: React.FC<{
  icon: typeof Bell;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'danger';
}> = ({ icon: Icon, title, subtitle, right, onClick, tone = 'default' }) => {
  const contenido = (
    <>
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-destructive text-white' : 'bg-surface-high text-foreground',
        )}
      >
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block font-display text-title-card',
            tone === 'danger' ? 'text-destructive' : 'text-foreground',
          )}
        >
          {title}
        </span>
        {subtitle && <span className="block text-body-sm text-party-gray">{subtitle}</span>}
      </span>
      {right ?? (onClick && <ChevronRight size={18} className="shrink-0 text-party-gray" />)}
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'press flex w-full items-center gap-3 px-4 py-4 text-left',
        tone === 'danger' && 'rounded-2xl bg-destructive/15',
      )}
    >
      {contenido}
    </button>
  ) : (
    <div className="flex w-full items-center gap-3 px-4 py-4">{contenido}</div>
  );
};

/**
 * Tu perfil, según «Perfil de Usuario» de Stitch: la foto con el sello de
 * verificado, la tarjeta amarilla de Premium, tres tarjetas blancas (fotos,
 * sobre mí e intereses) y los ajustes en un bloque oscuro.
 */
const ProfilePage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const interestLabel = useInterestLabel();

  const { currentUser, refreshProfile, logout, activeEvent, userType } = useAppContext();
  const { isPremium, subscriptionType, expiresAt, setShowPremiumDialog, cancelPremium } = usePremium();

  const [captureTarget, setCaptureTarget] = useState<'avatar' | 'photo' | null>(null);
  const [showFaceVerification, setShowFaceVerification] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [planTonight, setPlanTonight] = useState('');
  const [isInvisible, setIsInvisible] = useState(false);
  const [wants, setWants] = useState<'men' | 'women' | 'all'>('all');

  const [allInterests, setAllInterests] = useState<Interest[]>([]);
  const [myInterestIds, setMyInterestIds] = useState<string[]>([]);
  const [editingInterests, setEditingInterests] = useState(false);

  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [fotoFallida, setFotoFallida] = useState<FailedPhoto[]>([]);
  const [pushStatus, setPushStatus] = useState<PushStatus>('unsupported');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [reputation, setReputation] = useState<Reputation | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setName(currentUser.name);
    setAge(String(currentUser.age));
    setBio(currentUser.bio);
    setPlanTonight(currentUser.planTonight ?? '');
    setIsInvisible(Boolean(currentUser.isInvisible));
    setWants(currentUser.wants ?? 'all');
  }, [currentUser]);

  useEffect(() => {
    void socialService.getInterests().then(setAllInterests);
    void api.getPendingPhotoCount().then(setPendingPhotos);
    setPushStatus(pushService.getStatus());
    void pushService.isSubscribed().then(setPushEnabled);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void socialService.getReputation(currentUser.id).then(setReputation);
  }, [currentUser]);

  // Los ids de mis intereses se derivan de los slugs guardados.
  useEffect(() => {
    if (allInterests.length === 0) return;
    void socialService.getMyInterests().then((slugs) => {
      setMyInterestIds(allInterests.filter((i) => slugs.includes(i.slug)).map((i) => i.id));
    });
  }, [allInterests]);

  const fail = useCallback(
    () => toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' }),
    [t, toast],
  );

  /** Guarda una foto, venga de la cámara o de la galería. */
  const guardarFoto = useCallback(
    async (target: 'avatar' | 'photo', blob: Blob) => {
      setIsSaving(true);
      try {
        if (target === 'avatar') {
          // También pasa por la revisión automática: si no la supera se dice
          // al momento y no se cambia nada.
          const result = await api.submitAvatarForReview(blob);
          if (!result.published) {
            setFotoFallida([{ index: 1, reason: result.reason }]);
            return;
          }
          toast({ title: t('profile.photoSaved') });
        } else {
          // Pasa por la misma moderación venga de donde venga: el origen de la
          // foto no cambia lo que se puede publicar.
          const result = await api.submitPhotoForReview(blob, 'photo.jpg');
          if (!result.published) {
            setFotoFallida([{ index: 1, reason: result.reason }]);
            return;
          }
          setPendingPhotos(await api.getPendingPhotoCount());
          toast({ title: t('photoCheck.approved') });
        }

        await api.refreshVerificationStatus();
        await refreshProfile();
      } catch (error) {
        console.error('Error saving photo:', error);
        fail();
      } finally {
        setIsSaving(false);
      }
    },
    [refreshProfile, toast, t, fail],
  );

  const handleGalleryFile = useCallback(
    async (file: File) => {
      const target = captureTarget;
      setCaptureTarget(null);
      if (target) await guardarFoto(target, file);
    },
    [captureTarget, guardarFoto],
  );

  const handleCapture = useCallback(
    async (dataUrl: string) => {
      const target = captureTarget;
      setCaptureTarget(null);
      if (!target || !currentUser) return;
      await guardarFoto(target, await api.dataUrlToBlob(dataUrl));
    },
    [captureTarget, currentUser, guardarFoto],
  );

  const removePhoto = useCallback(
    async (photoUrl: string) => {
      setIsSaving(true);
      try {
        // Borra también el fichero de Storage: el bucket es público, así que
        // quitar la URL del perfil no bastaba para dejar de exponerla.
        await api.removePhoto(photoUrl);
        await api.refreshVerificationStatus();
        await refreshProfile();
      } catch {
        fail();
      } finally {
        setIsSaving(false);
      }
    },
    [refreshProfile, fail],
  );

  const saveDetails = useCallback(async () => {
    const parsedAge = Number(age);
    if (!name.trim()) {
      toast({ title: t('profile.nameEmpty'), variant: 'destructive' });
      return;
    }
    if (!Number.isInteger(parsedAge) || parsedAge < 18 || parsedAge > 100) {
      toast({ title: t('profile.ageRange'), variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      await api.updateProfile({
        name: name.trim(),
        age: parsedAge,
        bio: bio.trim(),
        planTonight: planTonight.trim(),
      });
      await refreshProfile();
      setIsEditing(false);
      toast({ title: t('profile.updated') });
    } catch {
      fail();
    } finally {
      setIsSaving(false);
    }
  }, [name, age, bio, planTonight, refreshProfile, toast, t, fail]);

  const saveInterests = useCallback(async () => {
    setIsSaving(true);
    try {
      await socialService.setMyInterests(myInterestIds);
      setEditingInterests(false);
      toast({ title: t('profile.updated') });
    } catch {
      fail();
    } finally {
      setIsSaving(false);
    }
  }, [myInterestIds, toast, t, fail]);

  const toggleInvisible = useCallback(
    async (value: boolean) => {
      setIsInvisible(value);
      try {
        await api.updateProfile({ isInvisible: value });
        await refreshProfile();
      } catch {
        setIsInvisible(!value);
        fail();
      }
    },
    [refreshProfile, fail],
  );

  /** Cambia a quién se quiere ver y recarga el tablón con el nuevo filtro. */
  const changeWants = useCallback(
    async (value: 'men' | 'women' | 'all') => {
      const previous = wants;
      setWants(value);
      try {
        await api.updateProfile({ wants: value });
        await refreshProfile();
      } catch {
        setWants(previous);
        fail();
      }
    },
    [wants, refreshProfile, fail],
  );

  const togglePush = useCallback(async () => {
    if (pushEnabled) {
      await pushService.unsubscribe();
      setPushEnabled(false);
      return;
    }

    const ok = await pushService.subscribe();
    setPushStatus(pushService.getStatus());
    setPushEnabled(ok);

    toast(
      ok
        ? { title: t('notifications.enabled') }
        : { title: t('notifications.denied'), description: t('notifications.deniedBody'), variant: 'destructive' },
    );
  }, [pushEnabled, toast, t]);

  const cambiarIdioma = async (code: string) => {
    // Pasa por el módulo de i18n, que descarga el diccionario antes de cambiar.
    await changeLanguage(code);
    try {
      await api.updateProfile({ locale: code });
    } catch {
      // Sin guardar en el perfil, el cambio vive en este dispositivo.
    }
  };

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/', { replace: true });
  }, [logout, navigate]);

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  if (captureTarget) {
    return (
      <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
        <Header />
        <main className="mx-auto w-full max-w-sm px-margin pt-5">
          <h1 className="mb-4 text-center font-display text-headline-lg">
            {t(captureTarget === 'avatar' ? 'profile.newAvatar' : 'profile.newPhoto')}
          </h1>
          <CameraCapture
            onCapture={(dataUrl) => void handleCapture(dataUrl)}
            onCancel={() => setCaptureTarget(null)}
            facingMode="user"
          />

          {/* La galería es libre para las fotos del perfil: obligar a hacerse
              una foto en el momento para poner un avatar sólo conseguía que
              nadie pusiera ninguno. La restricción vive en la foto del evento. */}
          <input
            id="gallery-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleGalleryFile(file);
            }}
          />
          <PartyButton asChild variant="outline" className="mt-4 w-full cursor-pointer">
            <label htmlFor="gallery-photo">
              <ImageIcon size={16} />
              {t('profile.fromGallery')}
            </label>
          </PartyButton>
        </main>
        <Footer />
      </div>
    );
  }

  if (showFaceVerification) {
    return (
      <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
        <Header />
        <main className="mx-auto w-full max-w-sm px-margin pt-5">
          <FaceVerification
            onVerify={api.verifyFace}
            onComplete={async () => {
              setShowFaceVerification(false);
              await refreshProfile();
            }}
            onCancel={() => setShowFaceVerification(false)}
          />
        </main>
        <Footer />
      </div>
    );
  }

  const myInterestSlugs = allInterests.filter((i) => myInterestIds.includes(i.id)).map((i) => i.slug);
  const foto = currentUser.avatar || currentUser.photos[0];
  const idioma = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) ?? SUPPORTED_LANGUAGES[0];
  const miembroDesde = reputation
    ? new Date(reputation.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;
  const plan =
    subscriptionType === 'monthly'
      ? t('profile.planMonthly')
      : subscriptionType === 'event'
        ? t('profile.planEvent')
        : t('profile.planLifetime');

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto max-w-md">
        {/* ------------------------------------------------------- cabecera */}
        <section className="flex flex-col items-center px-margin pb-6 pt-4">
          <div className="relative">
            <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-surface-high shadow-xl">
              {foto ? (
                <img src={foto} alt={currentUser.name} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-headline-xl text-party-gray">
                  {currentUser.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {currentUser.isVerified && (
              <span
                className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-party-primary text-ink shadow-md"
                title={t('profile.verified')}
              >
                <BadgeCheck size={17} />
              </span>
            )}
            <button
              type="button"
              onClick={() => setCaptureTarget('avatar')}
              aria-label={t('profile.avatarChange')}
              className="press absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-party-primary text-ink shadow-lg"
            >
              <Camera size={16} />
            </button>
          </div>

          <h1 className="mt-3 text-center font-display text-headline-lg">
            {currentUser.name}, {currentUser.age}
          </h1>
          {miembroDesde && (
            <p className="mt-1 text-center text-body-sm text-[#C8C6C5]">
              {t('profile.memberSince', { date: miembroDesde })}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {reputation && (
              <span className="flex items-center gap-1.5 rounded-full bg-surface-high px-3 py-1 text-caption">
                <Sparkles size={14} className="text-party-primary" />
                {t('profile.eventsAttended', { count: reputation.eventsAttended })} ·{' '}
                {t('profile.connectionsMade', { count: reputation.connectionsMade })}
              </span>
            )}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-caption',
                currentUser.isVerified ? 'bg-surface-high' : 'bg-destructive/20 text-destructive',
              )}
            >
              <ShieldAlert size={14} className={currentUser.isVerified ? 'text-party-primary' : ''} />
              {currentUser.isVerified ? t('profile.verified') : t('profile.unverified')}
            </span>
          </div>
        </section>

        <div className="flex flex-col gap-4 px-margin">
          {/* ---------------------------------------------------- premium */}
          <section className="rounded-xl bg-party-primary p-4 text-ink shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-party-primary">
                <Crown size={22} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-headline-md leading-none">{t('premium.title')}</span>
                  {isPremium && (
                    <span className="rounded-full bg-ink px-2 py-0.5 text-caption uppercase tracking-wider text-party-primary">
                      {plan}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-sm font-medium text-ink/85">
                  {isPremium
                    ? expiresAt
                      ? t('profile.until', { date: new Date(expiresAt).toLocaleDateString() })
                      : t('premium.active')
                    : t('profile.premiumPitch')}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-caption">
                <Zap size={15} className="shrink-0" />
                <span className="truncate">{t('premium.features.whoIsGoing')}</span>
              </span>
              {isPremium ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="press h-9 shrink-0 rounded-xl bg-ink px-4 font-display text-title-card text-white"
                >
                  {t('profile.manage')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPremiumDialog(true)}
                  className="press h-9 shrink-0 rounded-xl bg-ink px-4 font-display text-title-card text-party-primary"
                >
                  {t('profile.activate')}
                </button>
              )}
            </div>
          </section>

          {/* ----------------------------------------------- verificación */}
          {!currentUser.isVerified && (
            <section className="space-y-3 rounded-2xl bg-white p-4 text-ink">
              <h2 className="flex items-center gap-2 font-display text-headline-md">
                <ShieldAlert size={20} className="text-destructive" />
                {t('profile.completeVerification')}
              </h2>
              <p className="text-body-sm text-ink/60">{t('profile.verificationBody')}</p>
              <ul className="space-y-1.5 text-body-md">
                {[
                  [currentUser.photos.length > 0, t('profile.atLeastOnePhoto')] as const,
                  [Boolean(currentUser.faceVerified), t('profile.faceVerification')] as const,
                ].map(([hecho, texto]) => (
                  <li key={texto} className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full',
                        hecho ? 'bg-party-primary text-ink' : 'bg-destructive/15 text-destructive',
                      )}
                    >
                      {hecho ? <Check size={13} /> : <X size={13} />}
                    </span>
                    {texto}
                  </li>
                ))}
              </ul>
              {!currentUser.faceVerified && (
                <button
                  type="button"
                  onClick={() => setShowFaceVerification(true)}
                  className="press h-11 w-full rounded-xl bg-ink font-bold text-party-primary"
                >
                  {t('profile.verifyIdentity')}
                </button>
              )}
            </section>
          )}

          {/* -------------------------------------------------------- fotos */}
          <section className="rounded-2xl bg-white p-4 text-ink shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-headline-md">
                <Images size={20} />
                {t('profile.partyPhotos')}
              </h2>
              <span className="text-caption text-ink/60">
                {t('profile.photosCount', { count: currentUser.photos.length, max: MAX_PHOTOS })}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {currentUser.photos.map((photo) => (
                <div key={photo} className="relative aspect-square overflow-hidden rounded-xl bg-surface-high">
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => void removePhoto(photo)}
                    disabled={isSaving}
                    aria-label={t('common.delete')}
                    className="press absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}

              {Array.from({ length: Math.min(pendingPhotos, MAX_PHOTOS - currentUser.photos.length) }).map(
                (_, i) => (
                  <div
                    key={`pending-${i}`}
                    className="flex aspect-square items-center justify-center rounded-xl bg-surface-high p-1"
                  >
                    <span className="flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] text-[#E5E2E1] shadow-md">
                      <Clock3 size={11} className="text-party-primary" />
                      {t('profile.photoPending')}
                    </span>
                  </div>
                ),
              )}

              {currentUser.photos.length + pendingPhotos < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => setCaptureTarget('photo')}
                  aria-label={t('profile.newPhoto')}
                  className="press flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#D0D0D4] bg-[#F5F5F7] text-ink/70 hover:bg-[#EAEAEA]"
                >
                  <Plus size={26} />
                  <span className="text-caption">{t('profile.add')}</span>
                </button>
              )}
            </div>

            <p className="mt-2 text-center text-body-sm text-ink/60">{t('profile.photosVisible')}</p>
          </section>

          {/* ---------------------------------------------------- sobre mí */}
          <section className="rounded-2xl bg-white p-4 text-ink shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-headline-md">
                <IdCard size={20} />
                {t('profile.aboutMe')}
              </h2>
              <button
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                aria-label={isEditing ? t('common.cancel') : t('common.edit')}
                className="press flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F5F7] text-ink/60 hover:text-ink"
              >
                {isEditing ? <X size={16} /> : <Pencil size={16} />}
              </button>
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <label className="space-y-1">
                    <span className="text-caption text-ink/60">{t('auth.name')}</span>
                    <input
                      className={campoClaro}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={60}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-caption text-ink/60">{t('auth.age')}</span>
                    <input
                      className={campoClaro}
                      type="number"
                      min={18}
                      max={100}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-caption text-ink/60">{t('profile.bio')}</span>
                  <textarea
                    className={cn(campoClaro, 'min-h-[88px] resize-none')}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    maxLength={300}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-caption text-ink/60">{t('profile.planTonight')}</span>
                  <input
                    className={campoClaro}
                    value={planTonight}
                    onChange={(e) => setPlanTonight(e.target.value)}
                    placeholder={t('profile.planTonightPlaceholder')}
                    maxLength={80}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={isSaving}
                  className="press h-11 w-full rounded-xl bg-party-primary font-bold text-ink disabled:opacity-50"
                >
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            ) : (
              <>
                <p className="text-body-md font-normal leading-relaxed text-ink/90">
                  {currentUser.bio || t('profile.editBio')}
                </p>
                {currentUser.planTonight && (
                  <p className="mt-3 flex items-center gap-2 rounded-xl bg-black/[0.05] px-3 py-2 text-body-sm">
                    <Clock3 size={15} className="shrink-0" />
                    <span className="text-ink/60">{t('profile.planTonight')}:</span>
                    <strong className="truncate">{currentUser.planTonight}</strong>
                  </p>
                )}
              </>
            )}
          </section>

          {/* --------------------------------------------------- intereses */}
          <section
            className={cn(
              'rounded-2xl p-4 shadow-2xl',
              editingInterests ? 'bg-card text-foreground' : 'bg-white text-ink',
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-headline-md">
                <Sparkles size={20} />
                {t('profile.partyInterests')}
              </h2>
              <button
                type="button"
                onClick={() => setEditingInterests((prev) => !prev)}
                className={cn('press text-title-card font-bold', editingInterests ? 'text-party-gray' : 'text-ink/60')}
              >
                {editingInterests ? t('common.cancel') : t('common.edit')}
              </button>
            </div>

            {editingInterests ? (
              <div className="space-y-4">
                <p className="text-body-sm text-party-gray">{t('profile.interestsHelp')}</p>
                <InterestPicker value={myInterestIds} onChange={setMyInterestIds} />
                <PartyButton className="w-full" onClick={() => void saveInterests()} disabled={isSaving}>
                  {isSaving ? t('common.saving') : t('common.save')}
                </PartyButton>
              </div>
            ) : myInterestSlugs.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {myInterestSlugs.map((slug) => (
                  <span key={slug} className="rounded-full bg-party-primary px-3 py-1.5 text-body-sm font-bold text-ink">
                    {interestLabel(slug)}
                  </span>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingInterests(true)}
                className="press rounded-full bg-[#F5F5F7] px-3 py-1.5 text-body-sm text-ink/60"
              >
                + {t('profile.interestsHelp')}
              </button>
            )}
          </section>

          {/* ------------------------------------------------------ ajustes */}
          <AccountTypeCard />

          <section className="divide-y divide-[#2A2A2E] rounded-2xl bg-card">
            {/* Modo invisible: ves quién hay en el evento y a ti no te ve nadie.
                Es de pago porque desequilibra el tablón, así que sin
                suscripción el interruptor lleva a Premium en lugar de activarse. */}
            <Fila
              icon={EyeOff}
              title={
                <span className="flex items-center gap-2">
                  {t('profile.invisibleMode')}
                  <span className="rounded-full bg-party-primary px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                    {t('premium.badge')}
                  </span>
                </span>
              }
              subtitle={isPremium ? t('profile.invisibleModeHelp') : t('profile.invisibleModePremium')}
              right={
                <Switch
                  checked={isPremium && isInvisible}
                  onCheckedChange={(v) => (isPremium ? void toggleInvisible(v) : setShowPremiumDialog(true))}
                  aria-label={t('profile.invisibleMode')}
                />
              }
            />

            <Fila
              icon={Users}
              title={t('profile.groups')}
              subtitle={
                activeEvent ? (
                  <span className="text-party-primary">{t('profile.groupsActive', { name: activeEvent.eventName })}</span>
                ) : (
                  t('profile.groupsHelp')
                )
              }
              onClick={activeEvent ? () => navigate(`/event/${activeEvent.eventId}/live`) : undefined}
            />

            <Fila
              icon={Bell}
              title={t('profile.notifications')}
              subtitle={
                pushStatus === 'denied'
                  ? t('profile.notificationsBlocked')
                  : pushStatus === 'unsupported'
                    ? t('notifications.unsupported')
                    : t('profile.notificationsHelp')
              }
              right={
                <Switch
                  checked={pushEnabled}
                  disabled={pushStatus === 'unsupported' || pushStatus === 'denied'}
                  onCheckedChange={() => void togglePush()}
                  aria-label={t('profile.notifications')}
                />
              }
            />

            {/* A quién se quiere ver. El género no aparece aquí: se elige al
                registrarse y la base de datos impide cambiarlo. */}
            <div className="px-4 py-4">
              <p className="font-display text-title-card">{t('auth.wants')}</p>
              <p className="mb-3 text-body-sm text-party-gray">{t('profile.wantsHelp')}</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
                {(['women', 'men', 'all'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => void changeWants(option)}
                    aria-pressed={wants === option}
                    className={cn(
                      'press h-9 rounded-lg text-caption font-bold',
                      wants === option ? 'bg-party-primary text-ink' : 'text-party-gray',
                    )}
                  >
                    {t(`auth.wantsOptions.${option}`)}
                  </button>
                ))}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger className="press flex w-full items-center gap-3 px-4 py-4 text-left">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-high">
                  <Globe size={20} />
                </span>
                <span className="flex-1 font-display text-title-card">{t('common.language')}</span>
                <span className="flex items-center gap-2 text-body-md text-[#C8C6C5]">
                  <Flag code={idioma.code} size={14} />
                  {idioma.label}
                </span>
                <ChevronRight size={18} className="text-party-gray" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {SUPPORTED_LANGUAGES.map((language) => (
                  <DropdownMenuItem key={language.code} onClick={() => void cambiarIdioma(language.code)}>
                    <Flag code={language.code} size={14} />
                    <span className="ml-2 flex-1">{language.label}</span>
                    {language.code === idioma.code && <Check size={14} className="text-party-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Fila
              icon={History}
              title={t('profile.history')}
              subtitle={reputation ? t('profile.eventsAttended', { count: reputation.eventsAttended }) : undefined}
              onClick={() => navigate('/tickets?tab=past')}
            />

            <Fila icon={LockKeyhole} title={t('profile.privacy')} onClick={() => setShowPrivacy(true)} />

            <Fila
              icon={ShieldAlert}
              title={t('profile.safety')}
              subtitle={<span className="text-party-primary">{t('profile.safetyHelp')}</span>}
              onClick={() => setShowSafety(true)}
            />

            {/* La cuenta de administración usa la misma pantalla de perfil que
                cualquiera: sin esto no había forma de llegar al panel desde aquí. */}
            {userType === 'admin' && (
              <Fila
                icon={Shield}
                title={t('admin.title')}
                subtitle={t('admin.subtitle')}
                onClick={() => navigate('/admin/dashboard')}
              />
            )}

            <div className="p-2">
              <Fila icon={LogOut} title={t('profile.logout')} onClick={() => void handleLogout()} tone="danger" />
            </div>
          </section>

          {/* Eliminar la cuenta va aparte: no se pulsa por error al cerrar sesión. */}
          <section className="mt-4 divide-y divide-[#2A2A2E] rounded-2xl bg-card">
            <div className="p-2">
              <Fila
                icon={Trash2}
                title={t('privacy.deleteTitle')}
                subtitle={t('privacy.deleteBody')}
                onClick={() => {
                  setDeleteText('');
                  setConfirmDelete(true);
                }}
                tone="danger"
              />
            </div>
          </section>

          <p className="pb-4 pt-2 text-center text-caption uppercase tracking-widest text-party-gray/70">
            {t('profile.tagline')}
          </p>
        </div>
      </main>

      <SafetySheet open={showSafety} onOpenChange={setShowSafety} />
      <PrivacySheet open={showPrivacy} onOpenChange={setShowPrivacy} />

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('profile.cancelTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('profile.cancelBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.close')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void cancelPremium()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('premium.cancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar la cuenta: borra el perfil, las fotos, las conexiones, los
          mensajes y el usuario (Edge Function `delete-account`). */}
      <AlertDialog open={confirmDelete} onOpenChange={(open) => !isDeleting && setConfirmDelete(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('privacy.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('privacy.deleteBody')} {t('privacy.deleteConfirmBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder={t('privacy.deleteKeyword')}
            autoCapitalize="characters"
            aria-label={t('privacy.deleteKeyword')}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting || deleteText.trim().toUpperCase() !== t('privacy.deleteKeyword').toUpperCase()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void (async () => {
                  setIsDeleting(true);
                  try {
                    await privacyService.deleteMyAccount();
                    track('account_deleted');
                    toast({ title: t('privacy.deleted'), description: t('privacy.deletedBody') });
                    setConfirmDelete(false);
                    await logout();
                    navigate('/', { replace: true });
                  } catch {
                    fail();
                    setIsDeleting(false);
                  }
                })();
              }}
            >
              {isDeleting ? <Loader2 size={16} className="animate-spin" /> : t('privacy.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PhotoRequirementsDialog
        open={fotoFallida.length > 0}
        onOpenChange={(open) => !open && setFotoFallida([])}
        failed={fotoFallida}
        total={1}
      />
      <Footer />
    </div>
  );
};

export default ProfilePage;
