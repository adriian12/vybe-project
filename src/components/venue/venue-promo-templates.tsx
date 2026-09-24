import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Loader2, Pencil, Sparkles, Trophy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { Promotion, venueService } from '@/services/venue-service';
import { PROMO_TEMPLATES, PromoTemplate, templateDeadline } from '@/lib/promo-templates';
import { cn } from '@/lib/utils';
import InfoHelp from '@/components/venue/info-help';

interface Props {
  event: { id: string; startDate: string; endDate: string };
  venueId: string;
  promotions: Promotion[];
  canUse: boolean;
  /** Pinta sólo las promociones o sólo los retos; por defecto, los dos. */
  only?: 'promo' | 'challenge';
  onUpgrade: () => void;
  onChange: () => void;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** «2026-09-20T23:30Z» → «23:30» en hora local, para el campo de hora. */
const aCampoHora = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

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
const VenuePromoTemplates = ({ event, venueId, promotions, canUse, only, onUpgrade, onChange }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [programando, setProgramando] = useState<string | null>(null);
  const [horaProgramada, setHoraProgramada] = useState('');
  // Edición de un reto o promo: texto y horas.
  const [editando, setEditando] = useState<PromoTemplate | null>(null);
  const [form, setForm] = useState({ title: '', description: '', inicio: '', fin: '' });
  const [guardando, setGuardando] = useState(false);

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

  const abrirEdicion = (template: PromoTemplate) => {
    const actual = existente(template.key);
    const limite = templateDeadline(template, event);
    setForm({
      title: actual?.title ?? t(`venue.templates.${template.key}.title`),
      description: actual?.description ?? t(`venue.templates.${template.key}.description`),
      inicio: aCampoHora(actual?.startsAt),
      fin: aCampoHora(template.kind === 'challenge' ? actual?.challengeDeadline ?? limite : actual?.endsAt),
    });
    setEditando(template);
  };

  /** Guarda el texto y las horas; si todavía no existe, la crea sin activar. */
  const guardarEdicion = async () => {
    if (!editando) return;
    if (!canUse) {
      onUpgrade();
      return;
    }
    const template = editando;
    const esReto = template.kind === 'challenge';
    const inicio = form.inicio ? horaDelEvento(form.inicio, event) : null;
    const fin = form.fin ? horaDelEvento(form.fin, event) : null;
    setGuardando(true);
    try {
      const actual = existente(template.key);
      if (actual) {
        await venueService.updatePromotion(actual.id, {
          title: form.title.trim() || actual.title,
          description: form.description.trim() || null,
          startsAt: inicio,
          // Sin hora límite, la de la plantilla (sale del horario de la fiesta).
          ...(esReto ? { challengeDeadline: fin ?? templateDeadline(template, event) ?? null } : { endsAt: fin }),
        });
      } else {
        await venueService.createPromotion(venueId, {
          eventId: event.id,
          title: form.title.trim() || t(`venue.templates.${template.key}.title`),
          description: form.description.trim() || undefined,
          kind: template.kind,
          startsAt: inicio ?? undefined,
          endsAt: esReto ? undefined : fin ?? undefined,
          maxPerPerson: template.maxPerPerson ?? 1,
          templateKey: template.key,
          challengeType: template.challengeType,
          challengeTarget: template.challengeTarget,
          challengeDeadline: esReto ? fin ?? templateDeadline(template, event) : templateDeadline(template, event),
        });
        // Queda guardada pero apagada: se enciende con su interruptor.
        const nuevas = await venueService.getPromotions(event.id);
        const creada = nuevas.find((p) => p.templateKey === template.key);
        if (creada) await venueService.setPromotionActive(creada.id, false);
      }
      setEditando(null);
      onChange();
    } catch (error) {
      fail(error);
    } finally {
      setGuardando(false);
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
            <p className="text-body-md font-bold">{actual?.title ?? t(`venue.templates.${template.key}.title`)}</p>
            {actual?.description && <p className="text-caption">{actual.description}</p>}
            <p className="text-caption text-party-gray">
              {t(`venue.templates.${template.key}.how`, {
                count: template.challengeTarget ?? 1,
                time: (template.kind === 'challenge' ? actual?.challengeDeadline ?? limite : limite)
                  ? hora((template.kind === 'challenge' ? actual?.challengeDeadline ?? limite : limite) as string)
                  : '',
                minutes: template.durationMinutes ?? 0,
              })}
            </p>
            <button
              type="button"
              onClick={() => abrirEdicion(template)}
              className="press mt-1 flex items-center gap-1 text-caption font-bold underline underline-offset-2"
            >
              <Pencil size={12} />
              {t('common.edit')}
            </button>
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

  // Sin el plan no se enseña: las funciones de pago no ocupan el panel.
  if (!canUse) return null;

  return (
    <div className="surface-light space-y-4 rounded-2xl p-4">
      {only !== 'challenge' && (
        <div>
          <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
            <Sparkles size={17} className="text-party-primary" />
            {t('venue.templates.promosTitle')}
            <InfoHelp topic="promos" />
          </h3>
          <p className="text-caption text-party-gray">{t('venue.templates.promosSubtitle')}</p>
        </div>
      )}


      {only !== 'challenge' && <ul className="space-y-2">{bloque('promo').map(tarjeta)}</ul>}

      {only !== 'promo' && (
        <div className={only === 'challenge' ? '' : 'border-t border-black/[0.06] pt-4'}>
          <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
            <Trophy size={17} className="text-party-primary" />
            {t('venue.templates.challengesTitle')}
            <InfoHelp topic="challenges" />
          </h3>
          <p className="mb-3 text-caption text-party-gray">{t('venue.templates.challengesSubtitle')}</p>
          <ul className="space-y-2">{bloque('challenge').map(tarjeta)}</ul>
        </div>
      )}

      <Dialog open={editando !== null} onOpenChange={(open) => !open && !guardando && setEditando(null)}>
        <DialogContent className="cards-light">
          <DialogHeader className="text-left">
            <DialogTitle>{t('venue.templates.editTitle')}</DialogTitle>
            <DialogDescription>{t('venue.templates.editBody')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-title">{t('venue.templates.fieldTitle')}</Label>
              <Input
                id="tpl-title"
                value={form.title}
                maxLength={80}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">{t('venue.templates.fieldDescription')}</Label>
              <Textarea
                id="tpl-desc"
                rows={3}
                maxLength={300}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-start">{t('venue.templates.fieldStart')}</Label>
                <Input
                  id="tpl-start"
                  type="time"
                  value={form.inicio}
                  onChange={(e) => setForm((f) => ({ ...f, inicio: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-end">
                  {editando?.kind === 'challenge' ? t('venue.templates.fieldDeadline') : t('venue.templates.fieldEnd')}
                </Label>
                <Input
                  id="tpl-end"
                  type="time"
                  value={form.fin}
                  onChange={(e) => setForm((f) => ({ ...f, fin: e.target.value }))}
                />
              </div>
            </div>
            <PartyButton className="w-full" disabled={guardando} onClick={() => void guardarEdicion()}>
              {guardando ? <Loader2 size={16} className="animate-spin" /> : t('common.save')}
            </PartyButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VenuePromoTemplates;
