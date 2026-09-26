import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCircle2, Loader2, MapPin, MapPinOff, Plus, RefreshCw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { adminService, FunoutEvent } from '@/services/admin';
import { cn } from '@/lib/utils';

/** Tras media hora los datos de Funout se vuelven a pedir al abrir la sección. */
const CADUCA_MS = 30 * 60_000;

/**
 * Eventos → FUNOUT (migración 082).
 *
 * Los eventos de Funout que aún no han empezado, con los datos que usa
 * Fiestea. Se marcan (uno a uno o todos) y «Añadir a FIESTEA» los crea como
 * fiestas del local de la casa; las ya añadidas se quedan marcadas como tales
 * y se ponen al día solas en cada sincronización.
 */
const AdminFunout = ({ onImported }: { onImported?: () => void }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [eventos, setEventos] = useState<FunoutEvent[] | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [sincronizando, setSincronizando] = useState(false);
  const [importando, setImportando] = useState(false);

  const cargar = useCallback(async () => {
    const lista = await adminService.listFunout();
    setEventos(lista);
    return lista;
  }, []);

  const sincronizar = useCallback(
    async (avisar: boolean) => {
      setSincronizando(true);
      try {
        const { saved } = await adminService.syncFunout();
        await cargar();
        if (avisar) toast({ title: t('admin.funout.synced', { count: saved }) });
      } catch {
        toast({ title: t('common.error'), description: t('admin.funout.syncError'), variant: 'destructive' });
      } finally {
        setSincronizando(false);
      }
    },
    [cargar, t, toast],
  );

  useEffect(() => {
    void cargar()
      .then((lista) => {
        const ultima = Math.max(0, ...lista.map((e) => new Date(e.syncedAt).getTime()));
        if (lista.length === 0 || Date.now() - ultima > CADUCA_MS) void sincronizar(false);
      })
      .catch(() => setEventos([]));
  }, [cargar, sincronizar]);

  const disponibles = useMemo(() => (eventos ?? []).filter((e) => !e.importedEventId), [eventos]);
  const todos = disponibles.length > 0 && disponibles.every((e) => marcados.has(e.funoutId));

  const alternar = (id: number) =>
    setMarcados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  const importar = async () => {
    setImportando(true);
    try {
      const n = await adminService.importFunout([...marcados]);
      setMarcados(new Set());
      await cargar();
      onImported?.();
      toast({ title: t('admin.funout.imported', { count: n, app: t('common.appName') }) });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setImportando(false);
    }
  };

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-3">
      {/* ------------------------------------------------------ acciones */}
      <div className="surface-light flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <label className="flex items-center gap-2 text-body-sm font-bold">
          <Checkbox
            checked={todos}
            disabled={disponibles.length === 0}
            onCheckedChange={(v) => setMarcados(v === true ? new Set(disponibles.map((e) => e.funoutId)) : new Set())}
          />
          {todos ? t('admin.funout.unselectAll') : t('admin.funout.selectAll')}
        </label>
        <span className="text-caption text-party-gray">
          {t('admin.funout.selected', { count: marcados.size, total: disponibles.length })}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sincronizando}
            onClick={() => void sincronizar(true)}
            className="press flex h-10 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(sincronizando && 'animate-spin')} />
            {t('admin.funout.refresh')}
          </button>
          <button
            type="button"
            disabled={importando || marcados.size === 0}
            onClick={() => void importar()}
            className="press flex h-10 items-center gap-1.5 rounded-lg bg-party-primary px-3 text-caption font-extrabold uppercase text-ink disabled:opacity-40"
          >
            {importando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('admin.funout.add', { app: t('common.appName').toUpperCase() })}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------- lista */}
      {eventos === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
        </div>
      ) : eventos.length === 0 ? (
        <p className="surface-light rounded-2xl p-6 text-center text-body-sm text-party-gray">
          {sincronizando ? t('admin.funout.loading') : t('admin.funout.empty')}
        </p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {eventos.map((e) => {
            const anadido = Boolean(e.importedEventId);
            const marcado = marcados.has(e.funoutId);
            return (
              <li key={e.funoutId}>
                <label
                  className={cn(
                    'surface-light flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-2 ring-transparent transition-shadow',
                    marcado && 'ring-party-primary',
                    anadido && 'cursor-default opacity-70',
                  )}
                >
                  <Checkbox
                    checked={marcado || anadido}
                    disabled={anadido}
                    onCheckedChange={() => alternar(e.funoutId)}
                    className="mt-1 shrink-0"
                    aria-label={e.title}
                  />
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/[0.06]">
                    {e.imageUrl ? (
                      <img src={e.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <CalendarDays size={18} className="text-party-gray" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{e.title}</span>
                    <span className="block truncate text-caption text-party-gray first-letter:uppercase">{fecha(e.startAt)}</span>
                    <span className="flex items-center gap-1 truncate text-caption text-party-gray">
                      {e.hasLocation ? <MapPin size={12} className="shrink-0" /> : <MapPinOff size={12} className="shrink-0 text-destructive" />}
                      <span className="truncate">{[e.placeName, e.city].filter(Boolean).join(' · ') || t('admin.funout.noPlace')}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {anadido && (
                        <span className="flex items-center gap-1 rounded-md bg-party-primary px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                          <CheckCircle2 size={11} />
                          {t('admin.funout.added', { app: t('common.appName') })}
                        </span>
                      )}
                      {e.genres.slice(0, 3).map((g) => (
                        <span key={g} className="rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-bold">
                          {g}
                        </span>
                      ))}
                      {!e.hasLocation && (
                        <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">
                          {t('admin.funout.noLocation')}
                        </span>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-caption text-party-gray">{t('admin.funout.note')}</p>
    </div>
  );
};

export default AdminFunout;
