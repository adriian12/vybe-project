import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Loader2, MapPin, Moon, PartyPopper } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useAppContext } from '@/context/app-context';
import { formatDistance, getCurrentPosition } from '@/services/geo';
import { nightService, NextParty } from '@/services/night';
import { vibeKey } from '@/lib/vibe';

/** Se ofrece media hora antes del final. */
const ANTES_MS = 30 * 60_000;

const guardadoKey = (eventId: string) => `vybe_whereNext_${eventId}`;

const yaVisto = (eventId: string): boolean => {
  try {
    return window.localStorage.getItem(guardadoKey(eventId)) === '1';
  } catch {
    return false;
  }
};

const marcarVisto = (eventId: string) => {
  try {
    window.localStorage.setItem(guardadoKey(eventId), '1');
  } catch {
    // Sin almacenamiento podría volver a salir; no es grave.
  }
};

/**
 * «¿Dónde seguimos?»: media hora antes de que acabe la fiesta en la que estás.
 *
 *   · Si acaba por la tarde o a medianoche (fiestas de tarde, 22:00–00:00): «la
 *     fiesta se está acabando, ¿quieres seguir de fiesta?».
 *   · Si acaba de madrugada (04:00–06:00): «¿seguimos de after?».
 *
 * «Ver fiestas cerca» busca lo que sigue abierto después de esa hora. Primero
 * los locales con suscripción a Vybe: si hay, salen en una lista; si no, se
 * abre el mapa filtrado a lo que sigue abierto.
 */
const WhereNextPrompt = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeEvent, userType } = useAppContext();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parties, setParties] = useState<NextParty[] | null>(null);

  const clubber = userType === 'user' || userType === 'admin';
  const eventId = activeEvent?.eventId ?? null;
  const end = activeEvent?.endDate ?? null;

  // Cada medio minuto se mira si ya es la hora.
  useEffect(() => {
    if (!clubber || !eventId || !end) return;
    const fin = new Date(end).getTime();

    const mirar = () => {
      const ahora = Date.now();
      if (ahora >= fin - ANTES_MS && ahora < fin + 60 * 60_000 && !yaVisto(eventId)) {
        marcarVisto(eventId);
        setParties(null);
        setOpen(true);
      }
    };

    mirar();
    const interval = setInterval(mirar, 30_000);
    return () => clearInterval(interval);
  }, [clubber, eventId, end]);

  const verFiestas = useCallback(async () => {
    if (!end) return;
    setLoading(true);
    try {
      const posicion = await getCurrentPosition().catch(() => null);
      const lista = await nightService.getNextParties(
        end,
        posicion ? { latitude: posicion.latitude, longitude: posicion.longitude } : null,
        eventId ?? undefined,
      );
      const suscritos = lista.filter((party) => party.subscribed);
      if (suscritos.length === 0) {
        setOpen(false);
        navigate(`/map?desde=${encodeURIComponent(end)}`);
        return;
      }
      setParties(suscritos);
    } finally {
      setLoading(false);
    }
  }, [end, eventId, navigate]);

  if (!clubber || !end) return null;

  const horaFin = new Date(end).getHours();
  const after = horaFin >= 3 && horaFin <= 8;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-party-primary text-ink">
            {after ? <Moon size={24} /> : <PartyPopper size={24} />}
          </span>
          <DialogTitle className="font-display text-headline-md">
            {t(after ? 'whereNext.afterTitle' : 'whereNext.title')}
          </DialogTitle>
          <DialogDescription>
            {t(after ? 'whereNext.afterBody' : 'whereNext.body', { event: activeEvent?.eventName ?? '' })}
          </DialogDescription>
        </DialogHeader>

        {parties ? (
          <div className="space-y-2">
            <ul className="space-y-2">
              {parties.map((party) => (
                <li key={party.eventId}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(`/event/${party.eventId}`);
                    }}
                    className="press flex w-full items-center gap-3 rounded-xl bg-surface-low p-2.5 text-left"
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-high">
                      {party.posterUrl && <img src={party.posterUrl} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate font-display text-title-card">
                        {party.eventName}
                        <BadgeCheck size={14} className="shrink-0 text-party-primary" />
                      </span>
                      <span className="block truncate text-caption text-party-gray">
                        {party.venueName}
                        {party.distance !== null ? ` · ${formatDistance(party.distance)}` : ''}
                        {' · '}
                        {t('whereNext.until', {
                          time: new Date(party.endDate).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          }),
                        })}
                      </span>
                      {party.vibeLevel && (
                        <span className="text-caption font-bold text-party-primary">{t(vibeKey(party.vibeLevel))}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <PartyButton
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => {
                setOpen(false);
                navigate(`/map?desde=${encodeURIComponent(end)}`);
              }}
            >
              <MapPin size={15} />
              {t('whereNext.seeMap')}
            </PartyButton>
          </div>
        ) : (
          <div className="grid gap-2">
            <PartyButton className="w-full gap-2" disabled={loading} onClick={() => void verFiestas()}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
              {t('whereNext.seeParties')}
            </PartyButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press h-10 text-body-sm text-party-gray"
            >
              {t('whereNext.notNow')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WhereNextPrompt;
