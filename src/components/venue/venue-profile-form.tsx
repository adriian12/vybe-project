import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Euro, Loader2, Store } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { nightService, OpeningDay } from '@/services/night';

/** Nombre del día en el idioma del navegador (2026-09-14 fue lunes). */
const nombreDia = (day: number) =>
  new Date(Date.UTC(2026, 8, 14 + day, 12)).toLocaleDateString(undefined, { weekday: 'long' });

/** Una semana de ocio nocturno típica: de jueves a sábado, de 23:00 a 06:00. */
const semanaInicial = (): OpeningDay[] =>
  Array.from({ length: 7 }, (_, day) => ({ day, open: '23:00', close: '06:00', closed: day < 3 || day === 6 }));

/**
 * Lo que sale en la ficha pública del local: descripción y horario. Y el gasto
 * medio por persona, que no se enseña a nadie pero con el que el informe semanal
 * calcula cuántos euros ha traído Vybe.
 */
const VenueProfileForm = ({ venueId }: { venueId: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState<OpeningDay[]>(semanaInicial);
  const [avgSpend, setAvgSpend] = useState('');

  useEffect(() => {
    let vivo = true;
    void nightService.getVenueDetails(venueId).then((d) => {
      if (!vivo) return;
      setDescription(d.description ?? '');
      if (d.openingHours.length > 0) {
        // Rellena los días que falten para que siempre haya siete filas.
        setHours(semanaInicial().map((base) => d.openingHours.find((h) => h.day === base.day) ?? { ...base, closed: true }));
      }
      setAvgSpend(d.avgSpend !== null ? String(d.avgSpend) : '');
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, [venueId]);

  const cambiar = (day: number, patch: Partial<OpeningDay>) =>
    setHours((prev) => prev.map((h) => (h.day === day ? { ...h, ...patch } : h)));

  const guardar = async () => {
    const gasto = avgSpend.trim() === '' ? null : Number(avgSpend.replace(',', '.'));
    if (gasto !== null && (!Number.isFinite(gasto) || gasto < 0 || gasto > 1000)) {
      toast({ title: t('venue.profileForm.avgSpendInvalid'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await nightService.updateVenueDetails(venueId, {
        description: description.trim() || null,
        openingHours: hours,
      });
      await nightService.setAvgSpend(gasto);
      toast({ title: t('venue.profileForm.saved') });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-party-primary" />
      </div>
    );
  }

  return (
    <div className="surface-light space-y-5 rounded-2xl p-4">
      <div>
        <h3 className="mb-1 flex items-center gap-2 font-display text-title-card uppercase">
          <Store size={17} />
          {t('venue.profileForm.title')}
        </h3>
        <p className="mb-3 text-caption text-party-gray">{t('venue.profileForm.hint')}</p>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
          placeholder={t('venue.profileForm.descriptionPlaceholder')}
          rows={4}
        />
        <p className="mt-1 text-right text-caption text-party-gray tabular">{description.length}/1000</p>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-2 text-body-sm font-bold">
          <Clock size={15} />
          {t('venue.profileForm.hours')}
        </h4>
        <ul className="space-y-2">
          {hours.map((h) => (
            <li key={h.day} className="flex items-center gap-2">
              <Switch
                checked={!h.closed}
                onCheckedChange={(open) => cambiar(h.day, { closed: !open })}
                aria-label={nombreDia(h.day)}
              />
              <span className="w-24 shrink-0 text-body-sm capitalize">{nombreDia(h.day)}</span>
              {h.closed ? (
                <span className="text-caption text-party-gray">{t('venuePage.closed')}</span>
              ) : (
                <span className="flex min-w-0 items-center gap-1">
                  <Input
                    type="time"
                    value={h.open}
                    onChange={(e) => cambiar(h.day, { open: e.target.value })}
                    className="h-9 w-[6.5rem] px-2"
                    aria-label={t('venue.profileForm.opens')}
                  />
                  <span className="text-party-gray">–</span>
                  <Input
                    type="time"
                    value={h.close}
                    onChange={(e) => cambiar(h.day, { close: e.target.value })}
                    className="h-9 w-[6.5rem] px-2"
                    aria-label={t('venue.profileForm.closes')}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="mb-1 flex items-center gap-2 text-body-sm font-bold">
          <Euro size={15} />
          {t('venue.profileForm.avgSpend')}
        </h4>
        <p className="mb-2 text-caption text-party-gray">{t('venue.profileForm.avgSpendHint')}</p>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            value={avgSpend}
            onChange={(e) => setAvgSpend(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="25"
            className="h-10 w-28"
          />
          <span className="text-body-sm text-party-gray">€ / {t('venue.profileForm.perPerson')}</span>
        </div>
      </div>

      <PartyButton className="w-full" disabled={saving} onClick={() => void guardar()}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : t('common.save')}
      </PartyButton>
    </div>
  );
};

export default VenueProfileForm;
