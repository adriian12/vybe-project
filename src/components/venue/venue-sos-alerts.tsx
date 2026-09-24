import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CheckCheck, Footprints, MapPin, ShieldCheck, Siren } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { openExternal } from '@/services/native';
import { horaAlerta, type VenueSos } from '@/hooks/use-venue-sos';
import type { VenueSosAlert } from '@/services/venue-service';
import { cn } from '@/lib/utils';

const FALLBACK_AVATAR = '/placeholder.svg';

const tieneUbicacion = (alerta: VenueSosAlert) => alerta.latitude !== null && alerta.longitude !== null;

/**
 * Las alertas de ayuda en Puerta, encima del recuento: es la pantalla que el
 * personal tiene abierta toda la noche.
 *
 * «Voy para allá» avisa al resto del equipo de que alguien la atiende (sigue
 * abierta); «Resuelta» la cierra y desaparece del panel y de administración.
 * Sin alertas queda una línea que dice que el aviso está vigilando.
 */
const VenueSosAlerts = ({ sos }: { sos: VenueSos }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [ocupada, setOcupada] = useState<string | null>(null);

  const run = async (alertId: string, accion: () => Promise<void>, hecho?: string) => {
    setOcupada(alertId);
    try {
      await accion();
      if (hecho) toast({ title: t(hecho) });
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setOcupada(null);
    }
  };

  if (sos.alerts.length === 0) {
    return (
      <p className="surface-light flex items-center gap-2 rounded-2xl px-4 py-3 text-caption text-party-gray">
        <ShieldCheck size={16} className="shrink-0 text-emerald-600" />
        {t('venue.safety.none')}
      </p>
    );
  }

  return (
    <section className="surface-light rounded-2xl border-2 border-destructive p-4" aria-live="assertive">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
        </span>
        <h3 className="font-display text-title-card uppercase tracking-wide text-destructive">
          {t('venue.safety.title')}
        </h3>
        <span className="ml-auto flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-2 text-caption font-extrabold text-white">
          {sos.alerts.length}
        </span>
      </div>

      <ul className="space-y-2">
        {sos.alerts.map((alerta) => {
          const atendida = Boolean(alerta.handledAt);
          const busy = ocupada === alerta.id;
          return (
            <li key={alerta.id} className={cn('rounded-xl p-3', atendida ? 'bg-black/[0.04]' : 'bg-destructive/10')}>
              <div className="flex items-start gap-3">
                <img
                  src={alerta.profilePhoto || FALLBACK_AVATAR}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-body-md font-bold">
                    {!atendida && <Siren size={15} className="shrink-0 text-destructive" />}
                    <span className="truncate">{t('venue.safety.needsHelp', { name: alerta.profileName })}</span>
                  </p>
                  <p className="truncate text-caption text-party-gray">
                    {alerta.eventName} · {horaAlerta(alerta.createdAt)}
                  </p>
                  {alerta.note && <p className="mt-1 break-words text-body-sm">«{alerta.note}»</p>}
                  {atendida && (
                    <p className="mt-1 inline-flex items-center gap-1 text-caption font-bold text-emerald-700">
                      <Check size={13} />
                      {t('venue.safety.beingHandled')}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!atendida && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(alerta.id, () => sos.acknowledge(alerta.id))}
                    className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive px-3 text-caption font-extrabold uppercase text-white disabled:opacity-50"
                  >
                    <Footprints size={15} />
                    {t('venue.safety.acknowledge')}
                  </button>
                )}
                {tieneUbicacion(alerta) && (
                  <button
                    type="button"
                    onClick={() =>
                      void openExternal(`https://www.google.com/maps?q=${alerta.latitude},${alerta.longitude}`)
                    }
                    className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 text-caption font-bold uppercase text-white"
                  >
                    <MapPin size={15} />
                    {t('venue.safety.seeLocation')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(alerta.id, () => sos.resolve(alerta.id), 'venue.safety.resolved')}
                  className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-black/15 px-3 text-caption font-bold uppercase disabled:opacity-50"
                >
                  <CheckCheck size={15} />
                  {t('venue.safety.resolve')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/**
 * Fuera de Puerta, una franja roja que lleva allí: una emergencia no puede
 * quedarse escondida en otra pestaña.
 */
export const VenueSosStrip = ({ sos, onOpen }: { sos: VenueSos; onOpen: () => void }) => {
  const { t } = useTranslation();
  if (sos.alerts.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="press flex w-full items-center gap-3 rounded-2xl bg-destructive px-4 py-3 text-left text-white"
    >
      <Siren size={20} className="shrink-0 animate-pulse" />
      <span className="min-w-0 flex-1 text-body-sm font-bold">
        {t('venue.safety.strip', { count: sos.alerts.length })}
      </span>
      <span className="shrink-0 text-caption font-extrabold uppercase">{t('venue.safety.openDoor')}</span>
    </button>
  );
};

export default VenueSosAlerts;
