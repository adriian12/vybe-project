import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader2, Minus, Pencil, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { guestListService, GuestListInfo } from '@/services/guest-lists';

interface GuestListJoinProps {
  eventId: string;
  /** Cambia cada vez que la persona marca «voy a ir»: entonces se le pregunta. */
  ask: number;
  defaultName?: string;
}

/**
 * La lista de invitados de la fiesta, desde la ficha.
 *
 * Al marcar «voy a ir», si el local tiene la lista activada y la persona no
 * está apuntada, se le pregunta si quiere apuntarse; con «Sí» ve el mensaje
 * del local («Lista gratis antes de las 19:00…»), su nombre y cuántos
 * acompañantes lleva. Una vez apuntada, la ficha lo dice y deja cambiarlo.
 */
const GuestListJoin = ({ eventId, ask, defaultName = '' }: GuestListJoinProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [info, setInfo] = useState<GuestListInfo | null>(null);
  const [paso, setPaso] = useState<null | 'ask' | 'form'>(null);
  const [nombre, setNombre] = useState(defaultName);
  const [acompanantes, setAcompanantes] = useState(0);
  const [busy, setBusy] = useState(false);
  const ultimaPregunta = useRef(ask);

  const cargar = useCallback(async () => {
    const datos = await guestListService.getInfo(eventId);
    setInfo(datos);
    return datos;
  }, [eventId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Al marcar «voy a ir».
  useEffect(() => {
    if (ask === ultimaPregunta.current) return;
    ultimaPregunta.current = ask;
    void cargar().then((datos) => {
      if (datos?.enabled && !datos.mine) setPaso('ask');
    });
  }, [ask, cargar]);

  const abrirFormulario = () => {
    setNombre(info?.mine?.name ?? defaultName);
    setAcompanantes(info?.mine?.companions ?? 0);
    setPaso('form');
  };

  const apuntarme = async () => {
    setBusy(true);
    try {
      await guestListService.join(eventId, nombre.trim(), acompanantes);
      await cargar();
      setPaso(null);
      toast({
        title: t('guestList.joined'),
        description: t('guestList.joinedBody', { count: acompanantes + 1 }),
      });
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const salir = async () => {
    setBusy(true);
    try {
      await guestListService.leave(eventId);
      await cargar();
      toast({ title: t('guestList.left') });
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const cambiar = (n: number) => setAcompanantes(Math.max(0, Math.min(50, Number.isFinite(n) ? Math.floor(n) : 0)));

  return (
    <>
      {info?.mine ? (
        <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-ink">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary">
            <ClipboardList size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-title-card">{t('guestList.onList')}</p>
            <p className="truncate text-caption text-ink/60">
              {info.mine.companions > 0
                ? t('guestList.lineWith', { name: info.mine.name, count: info.mine.companions })
                : info.mine.name}
              {info.mine.admitted > 0 ? ` · ${t('guestList.inside', { count: info.mine.admitted })}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={abrirFormulario}
            aria-label={t('guestList.change')}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.06]"
          >
            <Pencil size={15} />
          </button>
        </div>
      ) : info?.enabled ? (
        <button
          type="button"
          onClick={abrirFormulario}
          className="press flex w-full items-center gap-3 rounded-xl bg-white/[0.06] p-3 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary text-ink">
            <ClipboardList size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-title-card">{t('guestList.available')}</span>
            {info.message && <span className="block truncate text-caption text-party-gray">{info.message}</span>}
          </span>
        </button>
      ) : null}

      <Dialog open={paso !== null} onOpenChange={(open) => !open && setPaso(null)}>
        <DialogContent className="max-w-sm">
          {paso === 'ask' ? (
            <>
              <DialogHeader className="text-left">
                <DialogTitle>{t('guestList.askTitle')}</DialogTitle>
                <DialogDescription>{t('guestList.askBody')}</DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setPaso(null)}
                  className="press h-12 flex-1 rounded-xl border border-white/15 font-bold"
                >
                  {t('guestList.no')}
                </button>
                <button
                  type="button"
                  onClick={abrirFormulario}
                  className="press h-12 flex-1 rounded-xl bg-party-primary font-bold text-ink"
                >
                  {t('guestList.yes')}
                </button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader className="text-left">
                <DialogTitle>{t('guestList.formTitle')}</DialogTitle>
                {info?.message ? (
                  <DialogDescription className="rounded-xl bg-party-primary/15 p-3 font-bold text-foreground">
                    {info.message}
                  </DialogDescription>
                ) : (
                  <DialogDescription>{t('guestList.formBody')}</DialogDescription>
                )}
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="gl-name" className="text-caption font-bold">
                    {t('guestList.name')}
                  </label>
                  <Input id="gl-name" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label htmlFor="gl-count" className="text-caption font-bold">
                    {t('guestList.companions')}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="-1"
                      disabled={acompanantes <= 0}
                      onClick={() => cambiar(acompanantes - 1)}
                      className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] disabled:opacity-30"
                    >
                      <Minus size={18} />
                    </button>
                    <Input
                      id="gl-count"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={50}
                      value={acompanantes}
                      onChange={(e) => cambiar(Number(e.target.value))}
                      className="h-12 text-center font-display text-headline-md tabular"
                    />
                    <button
                      type="button"
                      aria-label="+1"
                      disabled={acompanantes >= 50}
                      onClick={() => cambiar(acompanantes + 1)}
                      className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] disabled:opacity-30"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <p className="text-caption text-party-gray">{t('guestList.total', { count: acompanantes + 1 })}</p>
                </div>
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <button
                  type="button"
                  disabled={busy || !nombre.trim()}
                  onClick={() => void apuntarme()}
                  className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-bold text-ink disabled:opacity-40"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  {t(info?.mine ? 'guestList.save' : 'guestList.join')}
                </button>
                {info?.mine && info.mine.admitted === 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void salir().then(() => setPaso(null))}
                    className="press h-10 w-full text-caption font-bold text-destructive"
                  >
                    {t('guestList.leave')}
                  </button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GuestListJoin;
