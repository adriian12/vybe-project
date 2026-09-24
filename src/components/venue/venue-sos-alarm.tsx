import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Footprints, Siren } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { horaAlerta, type VenueSos } from '@/hooks/use-venue-sos';

const FALLBACK_AVATAR = '/placeholder.svg';

// ---------------------------------------------------------------------------
// Sonido. El navegador no deja sonar nada hasta que la persona toca la página,
// así que el contexto de audio se crea (o se reanuda) con el primer toque y ya
// queda listo para cuando llegue una alerta.
// ---------------------------------------------------------------------------
let contexto: AudioContext | null = null;

const audio = (): AudioContext | null => {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    contexto ??= new Ctor();
    return contexto;
  } catch {
    return null;
  }
};

const desbloquear = () => {
  const ctx = audio();
  if (ctx?.state === 'suspended') void ctx.resume();
};

/** Tres pitidos de dos tonos, como una sirena corta. */
const sirena = () => {
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const inicio = ctx.currentTime;
  for (let i = 0; i < 3; i += 1) {
    const t0 = inicio + i * 0.5;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.setValueAtTime(660, t0 + 0.25);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.48);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.5);
  }
};

/**
 * La ventana que salta en el panel del local cuando alguien de la fiesta pide
 * ayuda, esté en la sección que esté: suena, vibra (en el móvil) y la pestaña
 * parpadea hasta que alguien la mira. Sale una vez por alerta.
 *
 * «Voy para allá» la marca como atendida y lleva a Puerta, donde se cierra
 * cuando está resuelta.
 */
const VenueSosAlarm = ({ sos, onOpenDoor }: { sos: VenueSos; onOpenDoor: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const alerta = sos.alarm;

  useEffect(() => {
    window.addEventListener('pointerdown', desbloquear);
    window.addEventListener('keydown', desbloquear);
    return () => {
      window.removeEventListener('pointerdown', desbloquear);
      window.removeEventListener('keydown', desbloquear);
    };
  }, []);

  const alertaId = alerta?.id;
  useEffect(() => {
    if (!alertaId) return;

    // Suena al llegar y cada cinco segundos durante un minuto, o hasta que
    // alguien la atienda.
    let veces = 0;
    const avisar = () => {
      sirena();
      navigator.vibrate?.([500, 200, 500, 200, 500]);
      veces += 1;
    };
    avisar();
    const repetir = setInterval(() => (veces < 12 ? avisar() : clearInterval(repetir)), 5_000);

    const titulo = document.title;
    let encendido = false;
    const parpadeo = setInterval(() => {
      encendido = !encendido;
      document.title = encendido ? `🚨 ${t('venue.safety.alarmTitle')}` : titulo;
    }, 1_000);

    return () => {
      clearInterval(repetir);
      clearInterval(parpadeo);
      document.title = titulo;
    };
  }, [alertaId, t]);

  const voy = async () => {
    if (!alerta) return;
    onOpenDoor();
    try {
      await sos.acknowledge(alerta.id);
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    }
  };

  return (
    <AlertDialog open={Boolean(alerta)} onOpenChange={(open) => !open && sos.dismissAlarm()}>
      <AlertDialogContent className="surface-light !bg-white border-4 border-destructive text-ink">
        {alerta && (
          <>
            <AlertDialogHeader className="items-center text-center sm:text-center">
              <span className="relative mb-1 flex h-16 w-16 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/40" />
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-white">
                  <Siren size={30} />
                </span>
              </span>
              <AlertDialogTitle className="font-display text-headline-md text-destructive">
                {t('venue.safety.alarmTitle')}
              </AlertDialogTitle>
              <div className="flex items-center gap-3 rounded-xl bg-black/[0.04] p-3 text-left">
                <img
                  src={alerta.profilePhoto || FALLBACK_AVATAR}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
                <AlertDialogDescription className="text-body-md text-ink">
                  {t('venue.safety.alarmBody', {
                    name: alerta.profileName,
                    event: alerta.eventName,
                    time: horaAlerta(alerta.createdAt),
                  })}
                </AlertDialogDescription>
              </div>
              {alerta.note && <p className="w-full break-words text-left text-body-sm">«{alerta.note}»</p>}
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel
                onClick={onOpenDoor}
                className="mt-0 h-12 border-black/15 bg-white text-ink hover:bg-black/[0.04]"
              >
                {t('venue.safety.openDoor')}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void voy()}
                className="h-12 gap-1.5 bg-destructive font-extrabold text-white hover:bg-destructive/90"
              >
                <Footprints size={16} />
                {t('venue.safety.acknowledge')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default VenueSosAlarm;
