import { createContext, useState, useContext, useCallback, useEffect, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/services/api';
import { useAppContext } from '@/context/app-context';
import { useToast } from '@/components/ui/use-toast';
import { track } from '@/lib/observability';
import { isNative, onAppResume, openExternal } from '@/services/native';

export type SubscriptionType = 'monthly' | 'event' | 'lifetime';

/** Precios que se enseñan; los que cobra Stripe son los de sus productos. */
// eslint-disable-next-line react-refresh/only-export-components
export const PREMIUM_PRICES = { monthly: 9.99, event: 4.99, supercrush: 1 } as const;

/**
 * Premium y supercrush.
 *
 * Todo sale de la base de datos (`my_premium_status()` y `my_supercrush()`), no
 * de un booleano en memoria: el Premium de un evento sólo vale en ese evento, y
 * eso lo decide el servidor mirando en qué evento estás. Por eso se vuelve a
 * leer cada vez que cambia el evento activo.
 */
interface PremiumContextType {
  isPremium: boolean;
  isLoading: boolean;
  subscriptionType: SubscriptionType | null;
  /** Evento del Premium por evento (null en el mensual). */
  premiumEventId: string | null;
  expiresAt: string | null;
  /** La mensual está cancelada y no se renovará. */
  cancelAtPeriodEnd: boolean;
  showPremiumDialog: boolean;
  setShowPremiumDialog: (show: boolean) => void;
  upgradeToPremium: () => Promise<boolean>;
  getPremiumForEvent: () => Promise<boolean>;
  cancelPremium: () => Promise<boolean>;
  /** Supercrush comprados o regalados que quedan (valen en cualquier evento). */
  supercrushBalance: number;
  /** Queda el supercrush que incluye Premium en el evento en el que estás. */
  supercrushIncluded: boolean;
  showSupercrushDialog: boolean;
  setShowSupercrushDialog: (show: boolean) => void;
  buySupercrush: (quantity: number) => Promise<boolean>;
  refreshSupercrush: () => Promise<void>;
}

const PremiumContext = createContext<PremiumContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const usePremium = () => {
  const context = useContext(PremiumContext);
  if (context === undefined) {
    throw new Error('usePremium debe ser usado dentro de un PremiumProvider');
  }
  return context;
};

export const PremiumProvider = ({ children }: { children: ReactNode }) => {
  const { isLoggedIn, userType, activeEvent } = useAppContext();
  const { toast } = useToast();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [subscriptionType, setSubscriptionType] = useState<SubscriptionType | null>(null);
  const [premiumEventId, setPremiumEventId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [showPremiumDialog, setShowPremiumDialog] = useState(false);
  const [supercrushBalance, setSupercrushBalance] = useState(0);
  const [supercrushIncluded, setSupercrushIncluded] = useState(false);
  const [showSupercrushDialog, setShowSupercrushDialog] = useState(false);

  const activo = isLoggedIn && userType !== 'venue';

  const loadSubscription = useCallback(async () => {
    if (!activo) {
      setIsPremium(false);
      setSubscriptionType(null);
      setPremiumEventId(null);
      setExpiresAt(null);
      setCancelAtPeriodEnd(false);
      setIsLoading(false);
      return;
    }
    try {
      const status = await api.getPremiumStatus();
      setIsPremium(status?.isPremium ?? false);
      setSubscriptionType((status?.subscriptionType as SubscriptionType | null) ?? null);
      setPremiumEventId(status?.eventId ?? null);
      setExpiresAt(status?.expiresAt ?? null);
      setCancelAtPeriodEnd(status?.cancelAtPeriodEnd ?? false);
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activo]);

  const refreshSupercrush = useCallback(async () => {
    if (!activo) {
      setSupercrushBalance(0);
      setSupercrushIncluded(false);
      return;
    }
    try {
      const status = await api.getSupercrush();
      setSupercrushBalance(status.balance);
      setSupercrushIncluded(status.includedAvailable);
    } catch (error) {
      console.error('Error loading supercrush:', error);
    }
  }, [activo]);

  // El evento activo decide si el Premium por evento cuenta: se relee al
  // entrar, al salir y al cambiar de fiesta.
  useEffect(() => {
    void loadSubscription();
    void refreshSupercrush();
  }, [loadSubscription, refreshSupercrush, activeEvent?.eventId]);

  // En la app instalada el pago va en el navegador del sistema: al volver a
  // la app se relee por si ya se ha cobrado.
  useEffect(() => {
    if (!isNative() || !activo) return;
    return onAppResume(() => {
      void loadSubscription();
      void refreshSupercrush();
    });
  }, [activo, loadSubscription, refreshSupercrush]);

  // Al volver de Stripe el webhook puede tardar un par de segundos: se lee al
  // momento y otra vez un poco después. En la app llega por el enlace
  // `vybe://profile?…` que abre `/pago.html`.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const checkout = params.get('checkout');
    const supercrush = params.get('supercrush');
    if (checkout !== 'success' && supercrush !== 'success') return;

    navigate(location.pathname, { replace: true });
    const releer = async () => {
      await Promise.all([loadSubscription(), refreshSupercrush()]);
    };
    void releer();
    const otraVez = window.setTimeout(() => void releer(), 4000);

    if (checkout === 'success') {
      track('premium_subscribed');
      toast({ title: t('premium.activated'), description: t('premium.activatedBody') });
    } else {
      track('supercrush_bought');
      toast({ title: t('supercrush.bought'), description: t('supercrush.boughtBody') });
    }
    return () => window.clearTimeout(otraVez);
  }, [location.search, location.pathname, navigate, loadSubscription, refreshSupercrush, toast, t]);

  const fallo = useCallback(
    (error: unknown) => {
      const code = error instanceof ApiError ? error.code : '';
      const known: Record<string, string> = {
        ALREADY_PREMIUM: 'premium.errors.already',
        NOT_AT_EVENT: 'premium.errors.notAtEvent',
        EVENT_REQUIRED: 'premium.needEvent',
        STRIPE_NOT_CONFIGURED: 'premium.errors.unavailable',
      };
      toast({
        title: t('common.error'),
        description: known[code] ? t(known[code]) : error instanceof ApiError ? error.message : t('errors.generic'),
        variant: 'destructive',
      });
    },
    [toast, t],
  );

  /** Abre Stripe. Premium lo activa el webhook cuando el cobro se confirma. */
  const checkout = useCallback(
    async (plan: 'monthly' | 'event' | 'supercrush', options: { eventId?: string; quantity?: number } = {}) => {
      try {
        const url = await api.startCheckout(plan, options);
        if (isNative()) {
          setShowPremiumDialog(false);
          setShowSupercrushDialog(false);
          await openExternal(url, { system: true });
        } else {
          window.location.href = url;
        }
        return true;
      } catch (error) {
        fallo(error);
        return false;
      }
    },
    [fallo],
  );

  const upgradeToPremium = useCallback(() => checkout('monthly'), [checkout]);

  const getPremiumForEvent = useCallback(async () => {
    if (!activeEvent?.eventId) {
      toast({ title: t('premium.needEvent') });
      return false;
    }
    return checkout('event', { eventId: activeEvent.eventId });
  }, [checkout, activeEvent?.eventId, toast, t]);

  const buySupercrush = useCallback(
    (quantity: number) => checkout('supercrush', { quantity: Math.max(1, Math.floor(quantity)) }),
    [checkout],
  );

  const cancelPremium = useCallback(async (): Promise<boolean> => {
    try {
      await api.cancelSubscription();
      await loadSubscription();
      toast({ title: t('premium.cancelled'), description: t('premium.cancelledBody') });
      return true;
    } catch (error) {
      fallo(error);
      return false;
    }
  }, [loadSubscription, toast, t, fallo]);

  const value: PremiumContextType = {
    isPremium,
    isLoading,
    subscriptionType,
    premiumEventId,
    expiresAt,
    cancelAtPeriodEnd,
    showPremiumDialog,
    setShowPremiumDialog,
    upgradeToPremium,
    getPremiumForEvent,
    cancelPremium,
    supercrushBalance,
    supercrushIncluded,
    showSupercrushDialog,
    setShowSupercrushDialog,
    buySupercrush,
    refreshSupercrush,
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
};
