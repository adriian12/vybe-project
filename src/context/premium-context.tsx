import { createContext, useState, useContext, useCallback, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '@/services/api';
import { useAppContext } from '@/context/app-context';
import { useToast } from '@/components/ui/use-toast';
import { track } from '@/lib/observability';

export type SubscriptionType = 'monthly' | 'event' | 'lifetime';

/**
 * Cupos por tipo de suscripción.
 *
 * `directMessages` estaba aquí y se ha quitado: escribir sin match nunca fue
 * posible —la policy de `messages` exige conexión desde la primera migración—,
 * así que era un número que no gobernaba nada. Y en una aplicación donde la
 * otra persona está a diez metros, cobrar por escribir sin permiso es vender
 * acoso.
 */
export interface PremiumFeatures {
  superLikes: number;
  seeWhoLikedYou: boolean;
  advancedFilters: boolean;
}

const FEATURES_BY_TYPE: Record<SubscriptionType, PremiumFeatures> = {
  monthly: { superLikes: 5, seeWhoLikedYou: true, advancedFilters: true },
  lifetime: { superLikes: 10, seeWhoLikedYou: true, advancedFilters: true },
  event: { superLikes: 3, seeWhoLikedYou: true, advancedFilters: false },
};

const NO_FEATURES: PremiumFeatures = {
  superLikes: 0,
  seeWhoLikedYou: false,
  advancedFilters: false,
};

interface PremiumContextType {
  isPremium: boolean;
  isLoading: boolean;
  subscriptionType: SubscriptionType | null;
  expiresAt: string | null;
  showPremiumDialog: boolean;
  setShowPremiumDialog: (show: boolean) => void;
  upgradeToPremium: () => Promise<boolean>;
  getPremiumForEvent: () => Promise<boolean>;
  cancelPremium: () => Promise<boolean>;
  premiumFeatures: PremiumFeatures;
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

  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [subscriptionType, setSubscriptionType] = useState<SubscriptionType | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [showPremiumDialog, setShowPremiumDialog] = useState(false);

  /** Lee la suscripción real de la base de datos, no un booleano en memoria. */
  const loadSubscription = useCallback(async () => {
    if (!isLoggedIn || userType === 'venue') {
      setSubscriptionId(null);
      setSubscriptionType(null);
      setExpiresAt(null);
      setIsLoading(false);
      return;
    }

    try {
      const subscription = await api.getActiveSubscription();
      setSubscriptionId(subscription?.id ?? null);
      setSubscriptionType((subscription?.subscription_type as SubscriptionType) ?? null);
      setExpiresAt(subscription?.expires_at ?? null);
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, userType]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  // Al volver de Stripe la suscripción ya existe: refrescamos y avisamos.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;

    window.history.replaceState({}, document.title, window.location.pathname);
    void loadSubscription().then(() => {
      track('premium_subscribed');
      toast({ title: t('premium.activated'), description: t('premium.activatedBody') });
    });
  }, [loadSubscription, toast, t]);

  const subscribe = useCallback(
    async (type: SubscriptionType, eventId?: string): Promise<boolean> => {
      try {
        // Con Stripe configurado el cobro ocurre en la pasarela y la
        // suscripción la crea el webhook. Sin él, la activamos directamente
        // para no bloquear el desarrollo.
        const checkoutUrl = await api.startCheckout(type, eventId);

        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return true;
        }

        const subscription = await api.createSubscription(type, eventId);

        setSubscriptionId(subscription.id);
        setSubscriptionType(type);
        setExpiresAt(subscription.expires_at);
        setShowPremiumDialog(false);
        track('premium_subscribed', { type, gateway: 'none' });

        toast({
          title: t('premium.activated'),
          description: type === 'event' ? t('premium.activatedEvent') : t('premium.activatedBody'),
        });
        return true;
      } catch (error) {
        toast({
          title: t('common.error'),
          description: error instanceof ApiError ? error.message : t('errors.generic'),
          variant: 'destructive',
        });
        return false;
      }
    },
    [toast, t],
  );

  const upgradeToPremium = useCallback(() => subscribe('monthly'), [subscribe]);

  const getPremiumForEvent = useCallback(
    () => subscribe('event', activeEvent?.eventId),
    [subscribe, activeEvent?.eventId],
  );

  const cancelPremium = useCallback(async (): Promise<boolean> => {
    if (!subscriptionId) return false;

    try {
      await api.cancelSubscription(subscriptionId);
      setSubscriptionId(null);
      setSubscriptionType(null);
      setExpiresAt(null);
      toast({ title: t('premium.cancelled') });
      return true;
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof ApiError ? error.message : t('errors.generic'),
        variant: 'destructive',
      });
      return false;
    }
  }, [subscriptionId, toast, t]);

  const value: PremiumContextType = {
    isPremium: subscriptionType !== null,
    isLoading,
    subscriptionType,
    expiresAt,
    showPremiumDialog,
    setShowPremiumDialog,
    upgradeToPremium,
    getPremiumForEvent,
    cancelPremium,
    premiumFeatures: subscriptionType ? FEATURES_BY_TYPE[subscriptionType] : NO_FEATURES,
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
};
