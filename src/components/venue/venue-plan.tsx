import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Crown, Loader2, Lock, Sparkles } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { venueService, VenuePlanStatus } from '@/services/venue-service';
import { ApiError } from '@/services/api';
import { nightService } from '@/services/night';
import { isNative, openExternal } from '@/services/native';
import { BOOST_BUSINESS_PRICE, BOOST_PRICE, formatEuros, PLAN_FEATURES, PLAN_IDS, PLAN_PRICES, PLANS, TRIAL_DAYS } from '@/lib/venue-plans';

interface VenuePlanProps {
  plan: VenuePlanStatus | null;
  onUpgrade: () => void;
}

/** Lo que incluye cada plan, en el orden en que se muestra. */
const FEATURES = PLAN_FEATURES;

/** Barra de consumo de un límite del plan, en tinta oscura sobre el amarillo. `max` null: sin límite. */
const Usage = ({ label, used, max, unlimited }: { label: string; used: number; max: number | null; unlimited: string }) => {
  if (max === null) {
    return (
      <div className="flex items-center justify-between text-body-sm font-bold">
        <span>{label}</span>
        <span>
          {used} · {unlimited}
        </span>
      </div>
    );
  }
  const percent = max > 0 ? Math.min(Math.round((used / max) * 100), 100) : 0;
  const full = used >= max;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-body-sm font-bold">
        <span>{label}</span>
        <span className={full ? 'text-destructive' : ''}>
          {used}/{max}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink/15">
        <div
          className={`h-full rounded-full ${full ? 'bg-destructive' : 'bg-ink'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

/**
 * Plan del local, lo que lleva consumido y qué desbloquea subir.
 *
 * Los límites que se enseñan aquí son los mismos que aplica la base de datos
 * en `venue_plan_limits()`: si se cambian allí, hay que cambiarlos aquí. Se
 * duplican a propósito para que la pantalla no dependa de una llamada más,
 * pero conviene no perderlo de vista.
 */
const VenuePlan = ({ plan, onUpgrade }: VenuePlanProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [contratando, setContratando] = useState<string | null>(null);
  const [verPlanes, setVerPlanes] = useState(false);
  const [destacadosIncluidos, setDestacadosIncluidos] = useState<number | null>(null);
  const esBusiness = plan?.plan === 'business';

  useEffect(() => {
    if (esBusiness) void nightService.getIncludedBoostsLeft().then(setDestacadosIncluidos);
  }, [esBusiness]);

  /**
   * Contratar un plan.
   *
   * El botón sólo cambiaba de pestaña: los límites se aplicaban de verdad en la
   * base de datos, pero no había forma de pagar y el plan había que cambiarlo a
   * mano. Ahora abre la pasarela; la suscripción la activa el webhook cuando
   * Stripe confirma el cobro.
   */
  const contratar = async (elegido: 'business') => {
    setContratando(elegido);
    try {
      const url = await venueService.startPlanCheckout(elegido);

      if (!url) {
        // Sin Stripe configurado no hay pasarela: se dice, en lugar de dejar el
        // botón girando para siempre.
        toast({ title: t('venue.plan.notConfigured'), variant: 'destructive' });
        onUpgrade();
        return;
      }

      // En la app instalada tiene que ser el navegador del sistema: iOS va con
      // `limitsNavigationsToAppBoundDomains` y sin `WKAppBoundDomains` en el
      // Info.plist, así que la webview se niega a ir a checkout.stripe.com y la
      // compra se queda a medias.
      if (isNative()) {
        await openExternal(url, { system: true });
      } else {
        window.location.href = url;
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setContratando(null);
    }
  };

  if (!plan) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-party-primary" />
      </div>
    );
  }

  const enPrueba = plan.status === 'trialing';
  const diasPrueba = enPrueba && plan.expiresAt
    ? Math.max(Math.ceil((new Date(plan.expiresAt).getTime() - Date.now()) / 86_400_000), 0)
    : 0;

  const fecha = plan.expiresAt ? new Date(plan.expiresAt).toLocaleDateString() : null;
  const precioMes = (name: (typeof PLAN_IDS)[number]) =>
    PLAN_PRICES[name] === 0 ? t('venue.plan.free') : t('venue.plan.perMonth', { price: formatEuros(PLAN_PRICES[name]) });

  const tarjetasPlanes = (
    <div className="grid gap-3 lg:grid-cols-2">
      {PLAN_IDS.map((name) => {
        const details = PLANS[name];
        const isCurrent = plan.plan === name;

        return (
          <section
            key={name}
            className={cn(
              'surface-light relative overflow-hidden rounded-2xl p-5',
              isCurrent && 'ring-2 ring-inset ring-party-primary',
            )}
          >
            {isCurrent && (
              <span className="absolute right-0 top-0 rounded-bl-xl bg-party-primary px-3 py-1 text-[10px] font-extrabold uppercase text-ink">
                {t('venue.plan.yourPlan')}
              </span>
            )}

            <h3 className="flex items-center gap-2 font-display text-headline-md">
              {name === 'business' && <Crown size={17} className="text-party-accent" />}
              {t(`venue.plan.names.${name}`)}
            </h3>
            <p className="mt-0.5 text-body-sm text-party-gray">{t(`venue.plan.taglines.${name}`)}</p>
            <p className="mt-3 font-display text-headline-lg">{precioMes(name)}</p>
            {name === 'business' && !enPrueba && plan.plan === 'free' && (
              <p className="text-caption font-bold text-emerald-700">{t('venue.plan.trialNote', { count: TRIAL_DAYS })}</p>
            )}

            <ul className="mt-4 space-y-2 text-body-sm">
              <li className="flex items-center gap-2 font-semibold">
                <Check size={15} className="shrink-0 text-emerald-600" />
                {details.events === null ? t('venue.plan.eventsUnlimited') : t('venue.plan.eventsIncluded', { count: details.events })}
              </li>
              <li className="flex items-center gap-2 font-semibold">
                <Check size={15} className="shrink-0 text-emerald-600" />
                {details.team === null ? t('venue.plan.teamUnlimited') : t('venue.plan.teamIncluded', { count: details.team })}
              </li>
              {FEATURES.map((feature) => (
                <li
                  key={feature}
                  className={cn('flex items-center gap-2', details.features[feature] ? 'font-semibold' : 'text-party-gray/70')}
                >
                  {details.features[feature] ? (
                    <Check size={15} className="shrink-0 text-emerald-600" />
                  ) : (
                    <Lock size={14} className="shrink-0" />
                  )}
                  {t(`venue.plan.features.${feature}`)}
                </li>
              ))}
            </ul>

            {isCurrent && enPrueba && name !== 'free' ? (
              <PartyButton className="mt-5 w-full" disabled={contratando !== null} onClick={() => void contratar('business')}>
                {contratando === name ? t('venue.plan.opening') : t('venue.plan.keepPlan', { plan: t(`venue.plan.names.${name}`) })}
              </PartyButton>
            ) : isCurrent ? (
              <div className="mt-5 flex h-11 items-center justify-center rounded-xl border border-black/10 text-body-sm font-bold text-party-gray">
                {t('venue.plan.included')}
              </div>
            ) : name === 'free' ? (
              <div className="mt-5 flex h-11 items-center justify-center rounded-xl bg-black/[0.04] text-body-sm text-party-gray">
                {t('venue.plan.basic')}
              </div>
            ) : (
              <PartyButton className="mt-5 w-full" disabled={contratando !== null} onClick={() => void contratar('business')}>
                {contratando === name ? t('venue.plan.opening') : t('venue.plan.switchTo', { plan: t(`venue.plan.names.${name}`) })}
              </PartyButton>
            )}
          </section>
        );
      })}
    </div>
  );

  const notas = (
    <>
      <p className="px-1 text-caption text-party-gray">{t('venue.plan.billingNote')}</p>
      {!esBusiness && (
        <p className="px-1 text-caption text-party-gray">
          {t('venue.plan.boostNote', { price: formatEuros(BOOST_PRICE), business: formatEuros(BOOST_BUSINESS_PRICE) })}
        </p>
      )}
    </>
  );

  // Business ya pagado: un resumen discreto, con el precio del destacado a la
  // vista, y la comparativa de planes plegada.
  if (esBusiness && !enPrueba) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="surface-light rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink">
              <Crown size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 font-display text-headline-md">
                {t('venue.plan.names.business')}
                <span className="text-body-sm font-bold text-emerald-700">{t('venue.plan.statusActive')}</span>
              </p>
              <p className="text-body-sm text-party-gray">
                {precioMes('business')}
                {fecha && ` · ${plan.cancelAtPeriodEnd ? t('venue.plan.endsOn', { date: fecha }) : t('venue.plan.renewsOn', { date: fecha })}`}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 border-t border-black/[0.06] pt-4 text-body-sm sm:grid-cols-2">
            <p className="flex justify-between gap-2">
              <span className="text-party-gray">{t('venue.plan.activeEvents')}</span>
              <span className="font-bold">
                {plan.activeEvents} · {t('venue.plan.unlimited')}
              </span>
            </p>
            <p className="flex justify-between gap-2">
              <span className="text-party-gray">{t('venue.plan.teamMembers')}</span>
              <span className="font-bold">
                {plan.teamMembers} · {t('venue.plan.unlimited')}
              </span>
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-party-primary/15 px-4 py-3">
            <Sparkles size={17} className="shrink-0 text-ink" />
            <span className="font-semibold">{t('venue.plan.boostLabel')}</span>
            <span className="flex items-baseline gap-1.5 font-display text-title-card">
              <span className="font-normal text-party-gray line-through">{formatEuros(BOOST_PRICE)} €</span>
              {formatEuros(BOOST_BUSINESS_PRICE)} €
            </span>
            {destacadosIncluidos !== null && (
              <span className="w-full text-caption text-party-gray sm:ml-auto sm:w-auto">
                {destacadosIncluidos > 0
                  ? t('venue.plan.boostsLeft', { count: destacadosIncluidos })
                  : t('venue.plan.boostsUsed')}
              </span>
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={() => setVerPlanes((v) => !v)}
          aria-expanded={verPlanes}
          className="press flex w-full items-center justify-center gap-1.5 py-2 text-body-sm font-semibold text-party-gray hover:text-foreground"
        >
          {verPlanes ? t('venue.plan.compareHide') : t('venue.plan.compareShow')}
          <ChevronDown size={16} className={cn('transition-transform', verPlanes && 'rotate-180')} />
        </button>
        {verPlanes && tarjetasPlanes}
        {notas}
      </div>
    );
  }

  // «Plan & Suscripción» de Stitch: el plan actual en una tarjeta amarilla con
  // lo consumido, y debajo las opciones en tarjetas blancas.
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-party-primary p-5 text-ink">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-md bg-ink/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest">
            {t('venue.plan.current')}
          </span>
          <span className="text-caption font-bold">
            {enPrueba
              ? t('venue.plan.trialDaysLeft', { count: diasPrueba })
              : plan.status === 'active' || plan.plan === 'free'
                ? t('venue.plan.statusActive')
                : plan.status}
          </span>
        </div>
        <p className="mt-2 font-display text-headline-xl">{t(`venue.plan.names.${plan.plan}`)}</p>
        {plan.expiresAt && (
          <p className="text-body-sm font-semibold">
            {enPrueba
              ? t('venue.plan.trialEnds', { date: new Date(plan.expiresAt).toLocaleDateString() })
              : plan.cancelAtPeriodEnd
              ? t('venue.plan.endsOn', { date: new Date(plan.expiresAt).toLocaleDateString() })
              : t('venue.plan.renewsOn', { date: new Date(plan.expiresAt).toLocaleDateString() })}
          </p>
        )}

        <div className="mt-4 space-y-3 border-t border-ink/15 pt-4">
          <Usage label={t('venue.plan.activeEvents')} used={plan.activeEvents} max={plan.maxActiveEvents} unlimited={t('venue.plan.unlimited')} />
          <Usage label={t('venue.plan.teamMembers')} used={plan.teamMembers} max={plan.maxTeamMembers} unlimited={t('venue.plan.unlimited')} />
        </div>

        {plan.maxActiveEvents !== null && plan.activeEvents >= plan.maxActiveEvents && (
          <p className="mt-3 rounded-lg bg-ink px-3 py-2 text-caption font-bold text-party-primary">
            {t('venue.plan.eventLimitReached')}
          </p>
        )}
      </section>

      {tarjetasPlanes}
      {notas}
    </div>
  );
};

export default VenuePlan;
