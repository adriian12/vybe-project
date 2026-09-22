import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { PREMIUM_PRICES, usePremium } from '@/context/premium-context';

const MAX = 100;

const euros = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Comprar supercrush: «¿Cuántos quieres?» con un contador de − y +, que nunca
 * baja de 1. El total se enseña antes de ir a Stripe, que cobra 1 € × cantidad.
 * Los comprados valen en cualquier evento.
 */
const SupercrushDialog = () => {
  const { t } = useTranslation();
  const { showSupercrushDialog, setShowSupercrushDialog, buySupercrush, supercrushBalance } = usePremium();
  const [cantidad, setCantidad] = useState(1);
  const [enviando, setEnviando] = useState(false);

  // Cada vez que se abre empieza en 1.
  useEffect(() => {
    if (showSupercrushDialog) {
      setCantidad(1);
      setEnviando(false);
    }
  }, [showSupercrushDialog]);

  const total = cantidad * PREMIUM_PRICES.supercrush;

  return (
    <Dialog open={showSupercrushDialog} onOpenChange={(open) => !enviando && setShowSupercrushDialog(open)}>
      <DialogContent className="gap-0 p-0 sm:max-w-sm">
        <div className="bg-party-primary p-6 text-center text-ink">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink text-party-primary">
            <Star size={24} className="fill-party-primary" />
          </span>
          <DialogTitle className="font-display text-headline-lg">{t('supercrush.buyTitle')}</DialogTitle>
          <DialogDescription className="mt-1 text-body-md text-ink/75">{t('supercrush.buyBody')}</DialogDescription>
        </div>

        <div className="space-y-5 p-5">
          <p className="text-center text-body-md font-bold">{t('supercrush.howMany')}</p>

          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              disabled={cantidad <= 1 || enviando}
              aria-label={t('supercrush.less')}
              className="press flex h-12 w-12 items-center justify-center rounded-full bg-surface-high text-foreground disabled:opacity-40"
            >
              <Minus size={22} />
            </button>
            <span
              className="min-w-[3ch] text-center font-display text-headline-xl tabular-nums"
              aria-live="polite"
            >
              {cantidad}
            </span>
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.min(MAX, c + 1))}
              disabled={cantidad >= MAX || enviando}
              aria-label={t('supercrush.more')}
              className="press flex h-12 w-12 items-center justify-center rounded-full bg-party-primary text-ink disabled:opacity-40"
            >
              <Plus size={22} />
            </button>
          </div>

          <p className="text-center text-body-sm text-party-gray">
            {t('supercrush.priceLine', {
              count: cantidad,
              unit: euros(PREMIUM_PRICES.supercrush),
              total: euros(total),
            })}
          </p>

          <PartyButton
            size="lg"
            className="w-full"
            disabled={enviando}
            onClick={() => {
              setEnviando(true);
              void buySupercrush(cantidad).then((ok) => {
                if (!ok) setEnviando(false);
              });
            }}
          >
            {enviando ? t('premium.redirecting') : t('supercrush.pay', { total: euros(total) })}
          </PartyButton>

          <p className="text-center text-caption text-party-gray">
            {t('supercrush.youHave', { count: supercrushBalance })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SupercrushDialog;
