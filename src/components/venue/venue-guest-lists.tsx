import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ClipboardList, Loader2, Minus, Plus, Search, Trash2, Undo2, UserPlus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { GuestEntry, GuestList, guestListService, GuestListSettings } from '@/services/guest-lists';
import { cn } from '@/lib/utils';

/**
 * Listas de invitados en Puerta (todos los planes).
 *
 * Una pestaña por lista: la de la app (quien se apunta desde la ficha, si la
 * lista está activada) y una por cada RRPP, que se rellena a mano. En la
 * puerta se busca el nombre y se marca cuántos entran de esa línea: «Adrián
 * +10» con 5 dentro deja 6 huecos para más tarde.
 *
 * Con `door` (el enlace de Seguridad, sin cuenta) sólo se busca y se da
 * entrada: ni ajustes, ni listas nuevas, ni añadir o quitar nombres.
 */
export interface GuestListDoor {
  load: () => Promise<{ lists: GuestList[]; entries: GuestEntry[] }>;
  admit: (entryId: string, count: number) => Promise<void>;
}

const VenueGuestLists = ({ eventId, door }: { eventId: string; door?: GuestListDoor }) => {
  const gestionar = !door;
  const { t } = useTranslation();
  const { toast } = useToast();

  const [lists, setLists] = useState<GuestList[]>([]);
  const [entries, setEntries] = useState<GuestEntry[]>([]);
  const [settings, setSettings] = useState<GuestListSettings>({ enabled: false, message: null });
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [nuevaLista, setNuevaLista] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [acompanantes, setAcompanantes] = useState(0);
  const [entrando, setEntrando] = useState<{ id: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = useCallback(
    (error: unknown) => {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    },
    [t, toast],
  );

  const load = useCallback(async () => {
    try {
      if (door) {
        const datos = await door.load();
        setLists(datos.lists);
        setEntries(datos.entries);
        return;
      }
      const [datos, lineas] = await Promise.all([
        guestListService.getLists(eventId),
        guestListService.getEntries(eventId),
      ]);
      setLists(datos.lists);
      setSettings(datos.settings);
      setEntries(lineas);
      setMensaje((prev) => (prev === '' ? (datos.settings.message ?? '') : prev));
    } catch (error) {
      fail(error);
    } finally {
      setCargando(false);
    }
  }, [eventId, fail, door]);

  useEffect(() => {
    void load();
    // En la puerta hay varios móviles a la vez: se refresca solo.
    const interval = setInterval(() => void load(), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const actual = lists.find((l) => l.id === pestana) ?? lists[0] ?? null;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return entries.filter((e) => e.listId === actual?.id && (!q || e.name.toLowerCase().includes(q)));
  }, [entries, actual?.id, busqueda]);

  const ejecutar = async (accion: () => Promise<unknown>, hecho?: string) => {
    setBusy(true);
    try {
      await accion();
      if (hecho) toast({ title: t(hecho) });
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const guardarAjustes = (enabled: boolean) =>
    ejecutar(() => guestListService.saveSettings(eventId, enabled, mensaje), 'guestList.venue.saved');

  const crearLista = () => {
    const n = (nuevaLista ?? '').trim();
    if (!n) return;
    void ejecutar(async () => {
      const id = await guestListService.createList(eventId, n);
      setPestana(id);
      setNuevaLista(null);
    });
  };

  const anadir = () => {
    if (!actual || !nombre.trim()) return;
    void ejecutar(async () => {
      await guestListService.saveEntry(actual.id, null, nombre.trim(), acompanantes);
      setNombre('');
      setAcompanantes(0);
    });
  };

  const admitir = (entry: GuestEntry, count: number) =>
    void ejecutar(async () => {
      await (door ? door.admit(entry.id, count) : guestListService.admit(entry.id, count));
      setEntrando(null);
      navigator.vibrate?.(60);
    });

  if (cargando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
      </div>
    );
  }

  const nombreLista = (l: GuestList) =>
    l.kind === 'app' ? t('guestList.venue.appTab', { app: t('common.appName') }) : l.name;
  const totales = lists.reduce(
    (acc, l) => ({ entries: acc.entries + l.entries, people: acc.people + l.people, admitted: acc.admitted + l.admitted }),
    { entries: 0, people: 0, admitted: 0 },
  );

  return (
    <div className={cn('grid gap-4', gestionar && 'lg:grid-cols-12')}>
      {/* ------------------------------------------------ lista en la app */}
      <div className={cn('space-y-4', gestionar && 'lg:col-span-4')}>
        {gestionar && (
        <div className="surface-light space-y-3 rounded-2xl p-4">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-display text-title-card uppercase tracking-wide">{t('guestList.venue.appTitle')}</span>
              <span className="block text-caption text-party-gray">{t('guestList.venue.appHelp')}</span>
            </span>
            <Switch checked={settings.enabled} disabled={busy} onCheckedChange={(v) => void guardarAjustes(v)} />
          </label>
          <div className="space-y-1">
            <Input
              value={mensaje}
              maxLength={200}
              onChange={(e) => setMensaje(e.target.value)}
              placeholder={t('guestList.venue.messagePlaceholder')}
              aria-label={t('guestList.venue.messagePlaceholder')}
            />
            {mensaje !== (settings.message ?? '') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void guardarAjustes(settings.enabled)}
                className="press h-9 w-full rounded-lg bg-party-primary text-caption font-bold text-ink disabled:opacity-50"
              >
                {t('common.save')}
              </button>
            )}
          </div>
        </div>
        )}

        <div className="surface-light grid grid-cols-3 gap-2 rounded-2xl p-4 text-center">
          {[
            { label: t('guestList.venue.lines'), value: totales.entries },
            { label: t('guestList.venue.people'), value: totales.people },
            { label: t('guestList.venue.insideNow'), value: totales.admitted },
          ].map((item) => (
            <div key={item.label}>
              <p className="font-display text-headline-md tabular">{item.value}</p>
              <p className="text-caption uppercase tracking-wide text-party-gray">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------- listas */}
      <div className={cn('surface-light rounded-2xl p-4', gestionar && 'lg:col-span-8')}>
        <h3 className="mb-3 flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <ClipboardList size={17} />
          {t('guestList.venue.title')}
        </h3>

        {/* Mini pestañas: la de la app primero y una por RRPP. */}
        <div className="no-scrollbar -mx-1 mb-3 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          {lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setPestana(l.id)}
              className={cn(
                'press flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-bold uppercase',
                actual?.id === l.id ? 'bg-ink text-white' : 'bg-black/[0.06] text-ink/70',
              )}
            >
              {nombreLista(l)}
              <span className={cn('rounded-full px-1.5 text-[11px]', actual?.id === l.id ? 'bg-white/20' : 'bg-black/[0.08]')}>
                {l.admitted}/{l.people}
              </span>
            </button>
          ))}
          {!gestionar ? null : nuevaLista === null ? (
            <button
              type="button"
              onClick={() => setNuevaLista('')}
              className="press flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-black/20 px-3 text-caption font-bold"
            >
              <Plus size={13} />
              {t('guestList.venue.newList')}
            </button>
          ) : (
            <span className="flex shrink-0 items-center gap-1">
              <Input
                autoFocus
                value={nuevaLista}
                maxLength={40}
                onChange={(e) => setNuevaLista(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && crearLista()}
                placeholder={t('guestList.venue.listNamePlaceholder')}
                aria-label={t('guestList.venue.listNamePlaceholder')}
                className="h-9 w-40"
              />
              <button type="button" onClick={crearLista} aria-label={t('common.save')} className="press flex h-9 w-9 items-center justify-center rounded-full bg-party-primary text-ink">
                <Check size={15} />
              </button>
              <button type="button" onClick={() => setNuevaLista(null)} aria-label={t('common.cancel')} className="press flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.06]">
                <X size={15} />
              </button>
            </span>
          )}
        </div>

        {actual && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="flex h-10 min-w-[12rem] flex-1 items-center gap-2 rounded-xl bg-black/[0.04] px-3">
                <Search size={15} className="shrink-0 text-ink/50" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder={t('guestList.venue.search')}
                  aria-label={t('guestList.venue.search')}
                  className="h-full w-full bg-transparent text-body-sm outline-none"
                />
              </label>
              {gestionar && actual.kind === 'promoter' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('guestList.venue.deleteListConfirm', { name: actual.name }))) {
                      void ejecutar(async () => {
                        await guestListService.deleteList(actual.id);
                        setPestana(null);
                      });
                    }
                  }}
                  className="press flex h-10 items-center gap-1 rounded-xl px-3 text-caption font-bold text-destructive"
                >
                  <Trash2 size={14} />
                  {t('guestList.venue.deleteList')}
                </button>
              )}
            </div>

            {/* Añadir a mano (listas de RRPP; también se puede en la de la app). */}
            {gestionar && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] p-2">
              <Input
                value={nombre}
                maxLength={80}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && anadir()}
                placeholder={t('guestList.venue.namePlaceholder')}
                aria-label={t('guestList.venue.namePlaceholder')}
                className="h-10 min-w-[10rem] flex-1"
              />
              <div className="flex h-10 items-center rounded-xl border border-black/10 bg-white">
                <button type="button" aria-label="-1" onClick={() => setAcompanantes((n) => Math.max(0, n - 1))} className="press flex h-10 w-9 items-center justify-center">
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  value={acompanantes}
                  onChange={(e) => setAcompanantes(Math.max(0, Math.min(50, Math.floor(Number(e.target.value) || 0))))}
                  aria-label={t('guestList.companions')}
                  className="h-10 w-10 bg-transparent text-center font-bold tabular outline-none"
                />
                <button type="button" aria-label="+1" onClick={() => setAcompanantes((n) => Math.min(50, n + 1))} className="press flex h-10 w-9 items-center justify-center">
                  <Plus size={14} />
                </button>
              </div>
              <button
                type="button"
                disabled={busy || !nombre.trim()}
                onClick={anadir}
                className="press flex h-10 items-center gap-1.5 rounded-xl bg-party-primary px-3 text-caption font-bold text-ink disabled:opacity-40"
              >
                <UserPlus size={14} />
                {t('guestList.venue.add')}
              </button>
            </div>
            )}

            {visibles.length === 0 ? (
              <p className="py-4 text-center text-body-sm text-party-gray">
                {busqueda ? t('guestList.venue.noResults') : t(actual.kind === 'app' ? 'guestList.venue.emptyApp' : 'guestList.venue.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-black/[0.06]">
                {visibles.map((entry) => {
                  const total = entry.companions + 1;
                  const quedan = total - entry.admitted;
                  const completa = quedan <= 0;
                  const abierta = entrando?.id === entry.id;
                  return (
                    <li key={entry.id} className="py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-md font-bold">
                            {entry.name}
                            {entry.companions > 0 && <span className="ml-1 text-party-gray">+{entry.companions}</span>}
                          </p>
                          <p className={cn('text-caption', completa ? 'font-bold text-emerald-700' : 'text-party-gray')}>
                            {completa
                              ? t('guestList.venue.allIn', { count: total })
                              : entry.admitted > 0
                                ? t('guestList.venue.partial', { inside: entry.admitted, left: quedan })
                                : t('guestList.venue.notYet', { count: total })}
                          </p>
                        </div>
                        {entry.admitted > 0 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => admitir(entry, -1)}
                            aria-label={t('guestList.venue.undo')}
                            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-party-gray hover:bg-black/5"
                          >
                            <Undo2 size={15} />
                          </button>
                        )}
                        {!completa && !abierta && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => (quedan === 1 ? admitir(entry, 1) : setEntrando({ id: entry.id, count: quedan }))}
                            className="press h-9 shrink-0 rounded-lg bg-party-primary px-3 text-caption font-extrabold uppercase text-ink disabled:opacity-50"
                          >
                            {t('guestList.venue.admit')}
                          </button>
                        )}
                        {gestionar && entry.admitted === 0 && !abierta && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(t('guestList.venue.removeConfirm', { name: entry.name }))) {
                                void ejecutar(() => guestListService.deleteEntry(entry.id));
                              }
                            }}
                            aria-label={t('common.delete')}
                            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-party-gray hover:text-destructive"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>

                      {/* ¿Cuántos entran ahora? Por defecto, todos los que quedan. */}
                      {abierta && entrando && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-party-primary/15 p-2">
                          <span className="text-caption font-bold">{t('guestList.venue.howMany')}</span>
                          <div className="flex h-10 items-center rounded-xl border border-black/10 bg-white">
                            <button type="button" aria-label="-1" onClick={() => setEntrando({ ...entrando, count: Math.max(1, entrando.count - 1) })} className="press flex h-10 w-9 items-center justify-center">
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center font-bold tabular">{entrando.count}</span>
                            <button type="button" aria-label="+1" onClick={() => setEntrando({ ...entrando, count: Math.min(quedan, entrando.count + 1) })} className="press flex h-10 w-9 items-center justify-center">
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="text-caption text-party-gray">{t('guestList.venue.ofLeft', { count: quedan })}</span>
                          <span className="flex-1" />
                          <button type="button" onClick={() => setEntrando(null)} className="press h-10 rounded-lg px-3 text-caption font-bold">
                            {t('common.cancel')}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => admitir(entry, entrando.count)}
                            className="press h-10 rounded-lg bg-ink px-4 text-caption font-extrabold uppercase text-white disabled:opacity-50"
                          >
                            {t('guestList.venue.admitN', { count: entrando.count })}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VenueGuestLists;
