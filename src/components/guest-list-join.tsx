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
  /** Cambia cada vez que la persona marca «voy a ir»: entonces se le lleva a la lista. */
  ask: number;
  defaultName?: string;
}

/**
 * «Lista Fiestea»: la lista de invitados de la fiesta, desde la ficha.
 *
 * Si el negocio la activa, la ficha enseña encima de las entradas su mensaje
 * («Lista gratis antes de las 19:00…»), el nombre, cuántas personas más vienen
 * y «Apuntarme». Al marcar «voy a ir», la ficha baja hasta ella. Una vez
 * apuntada, la ficha lo dice y deja cambiarlo o borrarse.
 */
const GuestListJoin = ({ eventId, ask, defaultName = '' }: GuestListJoinProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [info, setInfo] = useState<GuestListInfo | null>(null);
  const [paso, setPaso] = useState<null | 'form'>(null);
  const tarjeta = useRef<HTMLElement | null>(null);
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
      if (datos?.enabled && !datos.mine) tarjeta.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
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
        <section ref={tarjeta} className="rounded-2xl bg-white p-4 text-ink">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary">
              <ClipboardList size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-title-card">{t('guestList.brandTitle', { app: t('common.appName') })}</h2>
              <p className="text-caption text-ink/60">{info.message || t('guestList.formBody')}</p>
            </div>
          </div>
          <div className="mt-3 flex items-stretch gap-2">
            <Input
              aria-label={t('guestList.name')}
              placeholder={t('guestList.name')}
              value={nombre}
              maxLength={80}
              autoComplete="name"
              onChange={(e) => setNombre(e.target.value)}
              className="h-12 min-w-0 flex-1 border-black/10 bg-black/[0.04] text-ink placeholder:text-ink/40"
            />
            <div className="flex h-12 shrink-0 items-center rounded-xl border border-black/10">
              <button
                type="button"
                aria-label="-1"
                disabled={acompanantes <= 0}
                onClick={() => cambiar(acompanantes - 1)}
                className="press flex h-12 w-9 items-center justify-center disabled:opacity-30"
              >
                <Minus size={15} />
              </button>
              <span className="min-w-[2.25rem] text-center font-bold tabular" aria-label={t('guestList.companions')}>
                +{acompanantes}
              </span>
              <button
                type="button"
                aria-label="+1"
                disabled={acompanantes >= 50}
                onClick={() => cambiar(acompanantes + 1)}
                className="press flex h-12 w-9 items-center justify-center disabled:opacity-30"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
          <p className="mt-1 text-caption text-ink/50">{t('guestList.total', { count: acompanantes + 1 })}</p>
          <button
            type="button"
            disabled={busy || !nombre.trim()}
            onClick={() => void apuntarme()}
            className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink font-bold text-white disabled:opacity-40"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {t('guestList.join')}
          </button>
        </section>
      ) : null}

      <Dialog open={paso !== null} onOpenChange={(open) => !open && setPaso(null)}>
        <DialogContent className="max-w-sm">
          {paso === 'form' && (
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
