import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, DoorOpen, Heart, Loader2, Percent, Settings2, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { EventLiveSettings as Ajustes, eventSettingsService } from '@/services/event-settings';
import { cn } from '@/lib/utils';

/**
 * «Ajustes de la fiesta»: lo que el negocio permite y enseña en esta fiesta.
 * Cada interruptor se guarda al tocarlo. Sólo lo ve el propietario (la base de
 * datos rechaza a los demás).
 *
 * Sin `eventId` (al crear la fiesta) es un borrador: `value` y `onChange`, y
 * quien crea la fiesta lo guarda después.
 *
 * Sin entrada no hay swipe: al apagarla se apaga y no se puede encender.
 */
type Props =
  | { eventId: string; value?: never; onChange?: never; className?: string }
  | { eventId?: never; value: Ajustes; onChange: (value: Ajustes) => void; className?: string };

const EventLiveSettings = ({ eventId, value, onChange, className }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [guardados, setAjustes] = useState<Ajustes | null>(null);
  const ajustes = eventId ? guardados : value;
  const [guardando, setGuardando] = useState<keyof Ajustes | null>(null);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!eventId) return;
    let vivo = true;
    void eventSettingsService.get(eventId).then((a) => {
      if (!vivo || !a) return;
      setAjustes(a);
      setMensaje(a.guestListMessage ?? '');
    });
    return () => {
      vivo = false;
    };
  }, [eventId]);

  if (!ajustes) {
    return (
      <div className={cn('surface-light flex justify-center rounded-2xl p-4', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-party-primary" />
      </div>
    );
  }

  const guardar = async (campo: keyof Ajustes, cambio: Ajustes) => {
    const nuevo = { ...cambio, swipe: cambio.entry && cambio.swipe };
    if (!eventId) {
      onChange?.(nuevo);
      return;
    }
    const antes = ajustes;
    setAjustes(nuevo);
    setGuardando(campo);
    try {
      await eventSettingsService.save(eventId, nuevo);
    } catch (error) {
      setAjustes(antes);
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setGuardando(null);
    }
  };

  const filas: { campo: 'entry' | 'swipe' | 'headcount' | 'genderSplit' | 'guestList'; icon: typeof Heart }[] = [
    { campo: 'entry', icon: DoorOpen },
    { campo: 'swipe', icon: Heart },
    { campo: 'headcount', icon: Users },
    { campo: 'genderSplit', icon: Percent },
    { campo: 'guestList', icon: ClipboardList },
  ];

  return (
    <section className={cn('surface-light rounded-2xl p-4', className)}>
      <h3 className="mb-1 flex items-center gap-2 font-display text-title-card uppercase">
        <Settings2 size={17} />
        {t('venue.liveSettings.title')}
      </h3>
      <p className="mb-2 text-caption text-party-gray">{t('venue.liveSettings.hint')}</p>
      <ul className="divide-y divide-black/[0.06]">
        {filas.map(({ campo, icon: Icon }) => (
          <li key={campo} className="py-3">
            <label className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.05]">
                <Icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-bold">{t(`venue.liveSettings.${campo}.title`)}</span>
                <span className="block text-caption text-party-gray">
                  {campo === 'swipe' && !ajustes.entry
                    ? t('venue.liveSettings.swipe.needsEntry')
                    : t(`venue.liveSettings.${campo}.body`)}
                </span>
              </span>
              {guardando === campo ? (
                <Loader2 size={18} className="mt-1 animate-spin text-party-gray" />
              ) : (
                <Switch
                  checked={ajustes[campo]}
                  disabled={guardando !== null || (campo === 'swipe' && !ajustes.entry)}
                  onCheckedChange={(v) => void guardar(campo, { ...ajustes, [campo]: v, guestListMessage: mensaje || null })}
                />
              )}
            </label>
            {campo === 'guestList' && ajustes.guestList && (
              <div className="mt-2 pl-11">
                <Input
                  value={mensaje}
                  maxLength={200}
                  placeholder={t('venue.liveSettings.guestList.messagePlaceholder')}
                  onChange={(e) => setMensaje(e.target.value)}
                  onBlur={() => {
                    if ((ajustes.guestListMessage ?? '') !== mensaje.trim()) {
                      void guardar('guestListMessage', { ...ajustes, guestListMessage: mensaje.trim() || null });
                    }
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default EventLiveSettings;
