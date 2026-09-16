import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Crown, Loader2, Lock } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { venueService, VenuePlanStatus } from '@/services/venue-service';
import { ApiError } from '@/services/api';
import { PLAN_FEATURES, PLANS } from '@/lib/venue-plans';

interface VenuePlanProps {
  plan: VenuePlanStatus | null;
  onUpgrade: () => void;
}

/** Lo que incluye cada plan, en el orden en que se muestra. */
const FEATURES = PLAN_FEATURES;

/** Barra de consumo de un límite del plan, en tinta oscura sobre el amarillo. */
const Usage = ({ label, used, max }: { label: string; used: number; max: number }) => {
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

  /**
   * Contratar un plan.
   *
   * El botón sólo cambiaba de pestaña: los límites se aplicaban de verdad en la
   * base de datos, pero no había forma de pagar y el plan había que cambiarlo a
   * mano. Ahora abre la pasarela; la suscripción la activa el webhook cuando
   * Stripe confirma el cobro.
   */
  const contratar = async (elegido: 'pro' | 'business') => {
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

      window.location.href = url;
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

  const order: Array<'free' | 'pro' | 'business'> = ['free', 'pro', 'business'];

  // «Plan & Suscripción» de Stitch: el plan actual en una tarjeta amarilla con
  // lo consumido, y debajo las tres opciones en tarjetas blancas.
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-party-primary p-5 text-ink">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-md bg-ink/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest">
            {t('venue.plan.current')}
          </span>
          <span className="text-caption font-bold">
            {plan.status === 'active' || plan.plan === 'free' ? t('venue.plan.statusActive') : plan.status}
          </span>
        </div>
        <p className="mt-2 font-display text-headline-xl">{t(`venue.plan.names.${plan.plan}`)}</p>
        {plan.expiresAt && (
          <p className="text-body-sm font-semibold">
            {plan.cancelAtPeriodEnd
              ? t('venue.plan.endsOn', { date: new Date(plan.expiresAt).toLocaleDateString() })
              : t('venue.plan.renewsOn', { date: new Date(plan.expiresAt).toLocaleDateString() })}
          </p>
        )}

        <div className="mt-4 space-y-3 border-t border-ink/15 pt-4">
          <Usage label={t('venue.plan.activeEvents')} used={plan.activeEvents} max={plan.maxActiveEvents} />
          <Usage label={t('venue.plan.teamMembers')} used={plan.teamMembers} max={plan.maxTeamMembers} />
        </div>

        {plan.activeEvents >= plan.maxActiveEvents && (
          <p className="mt-3 rounded-lg bg-ink px-3 py-2 text-caption font-bold text-party-primary">
            {t('venue.plan.eventLimitReached')}
          </p>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        {order.map((name) => {
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

              <ul className="mt-4 space-y-2 text-body-sm">
                <li className="flex items-center gap-2 font-semibold">
                  <Check size={15} className="shrink-0 text-emerald-600" />
                  {t('venue.plan.eventsIncluded', { count: details.events })}
                </li>
                <li className="flex items-center gap-2 font-semibold">
                  <Check size={15} className="shrink-0 text-emerald-600" />
                  {t('venue.plan.teamIncluded', { count: details.team })}
                </li>
                {FEATURES.map((feature) => (
                  <li
                    key={feature}
                    className={cn(
                      'flex items-center gap-2',
                      details.features[feature] ? 'font-semibold' : 'text-party-gray/70',
                    )}
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

              {isCurrent ? (
                <div className="mt-5 flex h-11 items-center justify-center rounded-xl border border-black/10 text-body-sm font-bold text-party-gray">
                  {t('venue.plan.included')}
                </div>
              ) : name === 'free' ? (
                <div className="mt-5 flex h-11 items-center justify-center rounded-xl bg-black/[0.04] text-body-sm text-party-gray">
                  {t('venue.plan.basic')}
                </div>
              ) : (
                <PartyButton
                  className="mt-5 w-full"
                  disabled={contratando !== null}
                  onClick={() => void contratar(name as 'pro' | 'business')}
                >
                  {contratando === name
                    ? t('venue.plan.opening')
                    : t('venue.plan.switchTo', { plan: t(`venue.plan.names.${name}`) })}
                </PartyButton>
              )}
            </section>
          );
        })}
      </div>

      <p className="px-1 text-caption text-party-gray">{t('venue.plan.billingNote')}</p>
    </div>
  );
};

export default VenuePlan;
