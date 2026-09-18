import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Crown, Loader2, Sparkles, Trophy } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { Promotion, venueService } from '@/services/venue-service';
import { PROMO_TEMPLATES, PromoTemplate, templateDeadline } from '@/lib/promo-templates';
import { cn } from '@/lib/utils';

interface Props {
  event: { id: string; startDate: string; endDate: string };
  venueId: string;
  promotions: Promotion[];
  canUse: boolean;
  onUpgrade: () => void;
  onChange: () => void;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** «23:30» → la fecha de ese evento a esa hora (si es de madrugada, al día siguiente). */
const horaDelEvento = (valor: string, event: { startDate: string }): string | null => {
  const [h, m] = valor.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  const inicio = new Date(event.startDate);
  const fecha = new Date(inicio);
  fecha.setHours(h, m, 0, 0);
  if (fecha.getTime() < inicio.getTime() - 6 * 3_600_000) fecha.setDate(fecha.getDate() + 1);
  return fecha.toISOString();
};

/**
 * Promociones y retos preestablecidos: cada uno con su explicación, un
 * interruptor para activarlo ya y la opción de programarlo a una hora. Las
 * horas límite de los retos salen del horario del evento.
 */
const VenuePromoTemplates = ({ event, venueId, promotions, canUse, onUpgrade, onChange }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [programando, setProgramando] = useState<string | null>(null);
  const [horaProgramada, setHoraProgramada] = useState('');

  const existente = (key: string) => promotions.find((p) => p.templateKey === key);

  const fail = (error: unknown) =>
    toast({
      title: t('common.error'),
      description: t(error instanceof ApiError ? error.message : 'errors.generic'),
      variant: 'destructive',
    });

  /** Activa (ya o a una hora) creando la promoción si aún no existe. */
  const activar = async (template: PromoTemplate, startsAt: string | null) => {
    if (!canUse) {
      onUpgrade();
      return;
    }
    setBusy(template.key);
    try {
      const actual = existente(template.key);
      if (actual) {
        await venueService.schedulePromotion(actual.id, startsAt);
      } else {
        const inicio = startsAt ?? new Date().toISOString();
        await venueService.createPromotion(venueId, {
          eventId: event.id,
          title: t(`venue.templates.${template.key}.title`),
          description: t(`venue.templates.${template.key}.description`),
          kind: template.kind,
          startsAt: startsAt ?? undefined,
          endsAt: template.durationMinutes
            ? new Date(new Date(inicio).getTime() + template.durationMinutes * 60_000).toISOString()
            : undefined,
          maxPerPerson: template.maxPerPerson ?? 1,
          templateKey: template.key,
          challengeType: template.challengeType,
          challengeTarget: template.challengeTarget,
          challengeDeadline: templateDeadline(template, event),
        });
      }
      setProgramando(null);
      setHoraProgramada('');
      onChange();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const desactivar = async (template: PromoTemplate) => {
    const actual = existente(template.key);
    if (!actual) return;
    setBusy(template.key);
    try {
      await venueService.setPromotionActive(actual.id, false);
      onChange();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const bloque = (kind: 'promo' | 'challenge') =>
    PROMO_TEMPLATES.filter((tpl) => (kind === 'challenge' ? tpl.kind === 'challenge' : tpl.kind !== 'challenge'));

  const tarjeta = (template: PromoTemplate) => {
    const actual = existente(template.key);
    const programada = actual?.active && actual.startsAt && new Date(actual.startsAt).getTime() > Date.now();
    const activa = Boolean(actual?.active);
    const limite = templateDeadline(template, event);

    return (
      <li key={template.key} className={cn('rounded-xl p-3', activa ? 'bg-party-primary/15' : 'bg-black/[0.03]')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body-md font-bold">{t(`venue.templates.${template.key}.title`)}</p>
            <p className="text-caption text-party-gray">
              {t(`venue.templates.${template.key}.how`, {
                count: template.challengeTarget ?? 1,
                time: limite ? hora(limite) : '',
                minutes: template.durationMinutes ?? 0,
              })}
            </p>
            {programada && actual?.startsAt && (
              <p className="mt-1 flex items-center gap-1 text-caption font-bold">
                <Clock size={12} />
                {t('venue.templates.scheduledAt', { time: hora(actual.startsAt) })}
              </p>
            )}
          </div>
          {busy === template.key ? (
            <Loader2 size={18} className="mt-1 shrink-0 animate-spin text-party-gray" />
          ) : (
            <Switch
              checked={activa}
              onCheckedChange={(value) => void (value ? activar(template, null) : desactivar(template))}
              aria-label={t(`venue.templates.${template.key}.title`)}
            />
          )}
        </div>

        {programando === template.key ? (
          <div className="mt-2 flex gap-2">
            <Input
              type="time"
              value={horaProgramada}
              onChange={(e) => setHoraProgramada(e.target.value)}
              aria-label={t('venue.templates.schedule')}
              className="h-9"
            />
            <PartyButton
              size="sm"
              className="h-9 shrink-0"
              disabled={!horaProgramada}
              onClick={() => {
                const cuando = horaDelEvento(horaProgramada, event);
                if (cuando) void activar(template, cuando);
              }}
            >
              {t('common.save')}
            </PartyButton>
          </div>
        ) : (
          !activa && (
            <button
              type="button"
              onClick={() => {
                setProgramando(template.key);
                setHoraProgramada('');
              }}
              className="press mt-2 flex items-center gap-1 text-caption font-bold underline underline-offset-2"
            >
              <Clock size={12} />
              {t('venue.templates.schedule')}
            </button>
          )
        )}
      </li>
    );
  };

  return (
    <div className="surface-light space-y-4 rounded-2xl p-4">
      <div>
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <Sparkles size={17} className="text-party-primary" />
          {t('venue.templates.promosTitle')}
        </h3>
        <p className="text-caption text-party-gray">{t('venue.templates.promosSubtitle')}</p>
      </div>

      {!canUse && (
        <button
          type="button"
          onClick={onUpgrade}
          className="press flex w-full items-center justify-center gap-2 rounded-lg bg-party-primary py-2.5 text-caption font-bold text-ink"
        >
          <Crown size={14} />
          {t('venue.promotions.needsPlan')}
        </button>
      )}

      <ul className="space-y-2">{bloque('promo').map(tarjeta)}</ul>

      <div className="border-t border-black/[0.06] pt-4">
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <Trophy size={17} className="text-party-primary" />
          {t('venue.templates.challengesTitle')}
        </h3>
        <p className="mb-3 text-caption text-party-gray">{t('venue.templates.challengesSubtitle')}</p>
        <ul className="space-y-2">{bloque('challenge').map(tarjeta)}</ul>
      </div>
    </div>
  );
};

export default VenuePromoTemplates;
