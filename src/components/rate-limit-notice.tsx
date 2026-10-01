import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { RATE_LIMITED_EVENT } from '@/integrations/supabase/client';

/**
 * Aviso cuando el servidor corta por demasiadas peticiones seguidas (429).
 * Como mucho uno cada 10 segundos, aunque fallen varias a la vez.
 */
const RateLimitNotice = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  useEffect(() => {
    let ultimo = 0;
    const avisar = () => {
      if (Date.now() - ultimo < 10_000) return;
      ultimo = Date.now();
      toast({ title: t('errors.rateLimited'), variant: 'destructive' });
    };
    window.addEventListener(RATE_LIMITED_EVENT, avisar);
    return () => window.removeEventListener(RATE_LIMITED_EVENT, avisar);
  }, [t, toast]);
  return null;
};

export default RateLimitNotice;
