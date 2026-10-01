import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { usePremium } from '@/context/premium-context';
import { premiumNight, PassedProfile, isPremiumRequired } from '@/services/premium-night';
import { ApiError } from '@/services/api';

/** Minutos que quedan de impulso, o 0 si ya se acabó. */
const minutosRestantes = (hasta: string | null): number => {
  if (!hasta) return 0;
  return Math.max(Math.ceil((new Date(hasta).getTime() - Date.now()) / 60000), 0);
};

/**
 * Las dos cosas que sólo valen mientras dura la fiesta.
 *
 *   · **Destacar una hora.** Una fiesta dura cinco horas, así que una hora
 *     delante del resto se nota de verdad. Uno por evento: si se pudieran
 *     encadenar, destacar dejaría de significar nada.
 *   · **Segunda oportunidad.** En una sala llena se desliza deprisa y con una
 *     mano. Descartar sin querer a alguien que está a diez metros es lo más
 *     frustrante que tiene la aplicación, porque sabes que sigue ahí.
 *
 * Es un hook y no un bloque de botones porque el diseño de Stitch las reparte:
 * la segunda oportunidad es el botón de rebobinar junto a las decisiones, y
 * destacar va en la fila de acciones del evento.
 */
export const useNightExtras = (eventId: string, onRecovered: () => void | Promise<void>) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPremium, setShowPremiumDialog } = usePremium();

  const [boostHasta, setBoostHasta] = useState<string | null>(null);
  const [lanzando, setLanzando] = useState(false);

  const [abierto, setAbierto] = useState(false);
  const [descartados, setDescartados] = useState<PassedProfile[]>([]);
  const [cargando, setCargando] = useState(false);
  const [recuperando, setRecuperando] = useState<string | null>(null);

  // El impulso se consulta al entrar y se refresca cada minuto para que la
  // cuenta atrás no se quede congelada.
  useEffect(() => {
    if (!isPremium) return;

    let vivo = true;
    const leer = () => {
      void premiumNight.currentBoost(eventId).then((hasta) => {
        if (vivo) setBoostHasta(hasta);
      });
    };

    leer();
    const reloj = setInterval(leer, 60_000);

    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [eventId, isPremium]);

  const destacar = useCallback(async () => {
    if (!isPremium) {
      setShowPremiumDialog(true);
      return;
    }

    setLanzando(true);
    try {
      const hasta = await premiumNight.startBoost(eventId);
      setBoostHasta(hasta);
      toast({ title: t('premium.boost.started') });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setLanzando(false);
    }
  }, [eventId, isPremium, setShowPremiumDialog, toast, t]);

  const abrirDescartados = useCallback(async () => {
    if (!isPremium) {
      setShowPremiumDialog(true);
      return;
    }

    setAbierto(true);
    setCargando(true);
    try {
      setDescartados(await premiumNight.passed(eventId));
    } catch (error) {
      if (!isPremiumRequired(error)) console.error('Error loading passed profiles:', error);
      setDescartados([]);
    } finally {
      setCargando(false);
    }
  }, [eventId, isPremium, setShowPremiumDialog]);

  const recuperar = useCallback(
    async (perfil: PassedProfile) => {
      setRecuperando(perfil.id);
      try {
        await premiumNight.undoPass(perfil.id, eventId);
        setDescartados((prev) => prev.filter((p) => p.id !== perfil.id));
        await onRecovered();
        toast({ title: t('premium.secondChance.recovered', { name: perfil.name }) });
      } catch {
        toast({ title: t('common.error'), variant: 'destructive' });
      } finally {
        setRecuperando(null);
      }
    },
    [eventId, onRecovered, toast, t],
  );

  const sheet = (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t('premium.secondChance.title')}</SheetTitle>
          <SheetDescription>{t('premium.secondChance.body')}</SheetDescription>
        </SheetHeader>

        {cargando ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
          </div>
        ) : descartados.length === 0 ? (
          <p className="py-8 text-center text-sm text-party-gray">{t('premium.secondChance.empty')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {descartados.map((perfil) => (
              <li key={perfil.id} className="flex items-center gap-3 rounded-2xl bg-surface-high/60 p-2">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarImage src={perfil.avatar ?? perfil.photos[0]} alt="" />
                  <AvatarFallback>{perfil.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>

                <span className="min-w-0 flex-1 truncate font-display text-title-card">
                  {perfil.name}, {perfil.age}
                </span>

                <PartyButton
                  size="sm"
                  className="shrink-0"
                  disabled={recuperando === perfil.id}
                  onClick={() => void recuperar(perfil)}
                >
                  {recuperando === perfil.id ? t('common.saving') : t('premium.secondChance.recover')}
                </PartyButton>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );

  return {
    isPremium,
    boostMinutes: minutosRestantes(boostHasta),
    boosting: lanzando,
    startBoost: destacar,
    openSecondChance: abrirDescartados,
    secondChanceSheet: sheet,
  };
};
