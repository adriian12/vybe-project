import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCircle2, Copy, ExternalLink, Loader2, MapPin, MapPinOff, Plus, Radar, Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { adminService, ScannedEvent } from '@/services/admin';
import { agrupar, clave } from '@/lib/scan-groups';
import { cn } from '@/lib/utils';

/** Pasadas 6 horas, al abrir la sección se vuelve a escanear sola. */
const CADUCA_MS = 6 * 3_600_000;
const POR_PAGINA = 60;
const CIUDADES = ['Barcelona', 'Madrid', 'Alicante'] as const;
const FUENTE: Record<ScannedEvent['source'], string> = { xceed: 'Xceed', ra: 'Resident Advisor', fourvenues: 'Fourvenues' };

const idDe = (grupo: ScannedEvent[]) => grupo.map((e) => e.id).sort().join('|');

/**
 * Eventos → ESCÁNER (migración 114).
 *
 * Las fiestas de Barcelona, Madrid y Alicante que publican Xceed y Resident
 * Advisor (`scan-sync`). La misma fiesta en varias webs sale una sola vez,
 * con un selector para elegir el enlace de entradas. «Repetida»: ya hay una
 * fiesta de Fiestea con ese nombre esa noche; no se puede marcar.
 */
const AdminScanner = ({ onImported }: { onImported?: () => void }) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [eventos, setEventos] = useState<ScannedEvent[] | null>(null);
  const [ciudad, setCiudad] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [enlace, setEnlace] = useState<Record<string, string>>({});
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const [escaneando, setEscaneando] = useState(false);
  const [importando, setImportando] = useState(false);

  const cargar = useCallback(async () => {
    const lista = await adminService.listScanned();
    setEventos(lista);
    return lista;
  }, []);

  const escanear = useCallback(
    async (avisar: boolean) => {
      setEscaneando(true);
      try {
        const { saved } = await adminService.scan();
        await cargar();
        if (avisar) toast({ title: t('admin.scanner.scanned', { count: saved }) });
      } catch {
        toast({ title: t('common.error'), description: t('admin.scanner.scanError'), variant: 'destructive' });
      } finally {
        setEscaneando(false);
      }
    },
    [cargar, t, toast],
  );

  useEffect(() => {
    void cargar()
      .then((lista) => {
        const ultima = Math.max(0, ...lista.map((e) => new Date(e.syncedAt).getTime()));
        if (lista.length === 0 || Date.now() - ultima > CADUCA_MS) void escanear(false);
      })
      .catch(() => setEventos([]));
  }, [cargar, escanear]);

  const grupos = useMemo(() => {
    const q = clave(busqueda);
    const lista = (eventos ?? []).filter(
      (e) =>
        (!ciudad || e.city === ciudad) &&
        (!q || clave(e.title).includes(q) || clave(e.placeName).includes(q) || e.lineup.some((a) => clave(a).includes(q))),
    );
    return agrupar(lista);
  }, [eventos, ciudad, busqueda]);

  // Al cambiar el filtro se vuelve a la primera página.
  useEffect(() => setVisibles(POR_PAGINA), [ciudad, busqueda]);

  const estado = (g: ScannedEvent[]) =>
    g.some((e) => e.importedEventId) ? 'added' : g.some((e) => e.existingEventId) ? 'repeated' : 'new';
  const disponibles = useMemo(() => grupos.filter((g) => estado(g) === 'new'), [grupos]);
  const todos = disponibles.length > 0 && disponibles.every((g) => marcados.has(idDe(g)));

  const alternar = (id: string) =>
    setMarcados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  const importar = async () => {
    const elegidos = grupos.filter((g) => marcados.has(idDe(g)));
    setImportando(true);
    try {
      const n = await adminService.importScanned(
        elegidos.map((g) => ({ ids: g.map((e) => e.id), ticket: enlace[idDe(g)] ?? g[0].id })),
      );
      setMarcados(new Set());
      await cargar();
      onImported?.();
      toast({ title: t('admin.scanner.imported', { count: n, app: t('common.appName') }), description: t('admin.funout.importedBody') });
    } catch (error) {
      const motivo = error instanceof Error ? error.message : '';
      toast({
        title: t('admin.funout.importError'),
        description: motivo ? t(`admin.funout.errors.${motivo}`, { defaultValue: motivo }) : undefined,
        variant: 'destructive',
      });
    } finally {
      setImportando(false);
    }
  };

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-3">
      {/* ------------------------------------------------------ acciones */}
      <div className="surface-light space-y-3 rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          {[null, ...CIUDADES].map((c) => (
            <button
              key={c ?? 'todas'}
              type="button"
              onClick={() => setCiudad(c)}
              className={cn(
                'press h-9 rounded-lg px-3 text-caption font-extrabold uppercase',
                ciudad === c ? 'bg-ink text-party-primary' : 'border border-black/15',
              )}
            >
              {c ?? t('admin.scanner.allCities')}
            </button>
          ))}
          <label className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-party-gray" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t('admin.scanner.search')} className="h-9 pl-9" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-body-sm font-bold">
            <Checkbox
              checked={todos}
              disabled={disponibles.length === 0}
              onCheckedChange={(v) => setMarcados(v === true ? new Set(disponibles.map(idDe)) : new Set())}
            />
            {todos ? t('admin.funout.unselectAll') : t('admin.funout.selectAll')}
          </label>
          <span className="text-caption text-party-gray">{t('admin.funout.selected', { count: marcados.size, total: disponibles.length })}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              disabled={escaneando}
              onClick={() => void escanear(true)}
              className="press flex h-10 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold disabled:opacity-50"
            >
              <Radar size={14} className={cn(escaneando && 'animate-pulse')} />
              {escaneando ? t('admin.scanner.scanning') : t('admin.scanner.scan')}
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
      </div>

      {/* ------------------------------------------------------- lista */}
      {eventos === null ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
        </div>
      ) : grupos.length === 0 ? (
        <p className="surface-light rounded-2xl p-6 text-center text-body-sm text-party-gray">
          {escaneando ? t('admin.scanner.scanning') : t('admin.scanner.empty')}
        </p>
      ) : (
        <>
          <ul className="grid gap-2 md:grid-cols-2">
            {grupos.slice(0, visibles).map((g) => {
              const id = idDe(g);
              const st = estado(g);
              const marcado = marcados.has(id);
              const primero = g[0];
              const cartel = g.find((e) => e.imageUrl)?.imageUrl ?? null;
              const sala = g.find((e) => e.placeName)?.placeName ?? null;
              const conUbicacion = g.some((e) => e.hasLocation);
              const artistas = [...new Map(g.flatMap((e) => e.lineup).map((a) => [clave(a), a])).values()];
              const generos = [...new Set(g.flatMap((e) => e.genres))];
              const elegido = enlace[id] ?? primero.id;
              return (
                <li key={id} className={cn('surface-light rounded-2xl p-3 ring-2 ring-transparent', marcado && 'ring-party-primary', st !== 'new' && 'opacity-70')}>
                  <label className={cn('flex items-start gap-3', st === 'new' ? 'cursor-pointer' : 'cursor-default')}>
                    <Checkbox
                      checked={marcado || st === 'added'}
                      disabled={st !== 'new'}
                      onCheckedChange={() => alternar(id)}
                      className="mt-1 shrink-0"
                      aria-label={primero.title}
                    />
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/[0.06]">
                      {cartel ? <img src={cartel} alt="" loading="lazy" className="h-full w-full object-cover" /> : <CalendarDays size={18} className="text-party-gray" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{primero.title}</span>
                      <span className="block truncate text-caption text-party-gray first-letter:uppercase">{fecha(primero.startAt)}</span>
                      <span className="flex items-center gap-1 truncate text-caption text-party-gray">
                        {conUbicacion ? <MapPin size={12} className="shrink-0" /> : <MapPinOff size={12} className="shrink-0 text-destructive" />}
                        <span className="truncate">{[sala, primero.city].filter(Boolean).join(' · ')}</span>
                      </span>
                      {artistas.length > 0 && (
                        <span className="block truncate text-caption">
                          <span className="font-bold">{t('admin.scanner.lineup')}:</span> {artistas.slice(0, 5).join(', ')}
                          {artistas.length > 5 ? ` +${artistas.length - 5}` : ''}
                        </span>
                      )}
                      <span className="mt-1 flex flex-wrap gap-1">
                        {st === 'added' && (
                          <span className="flex items-center gap-1 rounded-md bg-party-primary px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-ink">
                            <CheckCircle2 size={11} />
                            {t('admin.funout.added', { app: t('common.appName') })}
                          </span>
                        )}
                        {st === 'repeated' && (
                          <span className="flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-amber-700">
                            <Copy size={11} />
                            {t('admin.scanner.repeated')}
                          </span>
                        )}
                        {g.map((e) => (
                          <span key={e.id} className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {FUENTE[e.source]}
                          </span>
                        ))}
                        {generos.slice(0, 3).map((x) => (
                          <span key={x} className="rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-bold">
                            {x}
                          </span>
                        ))}
                        {!conUbicacion && (
                          <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive">{t('admin.funout.noLocation')}</span>
                        )}
                      </span>
                    </span>
                  </label>

                  {/* La misma fiesta en varias webs: de cuál es el enlace de entradas. */}
                  {g.length > 1 ? (
                    <fieldset className="mt-3 space-y-1 border-t border-black/[0.06] pt-2">
                      <legend className="mb-1 text-caption font-bold text-party-gray">{t('admin.scanner.chooseTicket')}</legend>
                      {g.map((e) => (
                        <label key={e.id} className="flex items-center gap-2 text-caption">
                          <input
                            type="radio"
                            name={`ticket-${id}`}
                            checked={elegido === e.id}
                            disabled={st !== 'new'}
                            onChange={() => setEnlace((prev) => ({ ...prev, [id]: e.id }))}
                            className="accent-ink"
                          />
                          <span className="font-bold">{FUENTE[e.source]}</span>
                          <a href={e.ticketUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 truncate text-party-gray underline">
                            <span className="truncate">{e.ticketUrl.replace(/^https?:\/\//, '')}</span>
                            <ExternalLink size={11} className="shrink-0" />
                          </a>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <a
                      href={primero.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-1 truncate pl-8 text-caption text-party-gray underline"
                    >
                      <span className="truncate">{primero.ticketUrl.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink size={11} className="shrink-0" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {visibles < grupos.length && (
            <button
              type="button"
              onClick={() => setVisibles((v) => v + POR_PAGINA)}
              className="press mx-auto block h-10 rounded-lg border border-white/20 px-4 text-caption font-bold text-white"
            >
              {t('admin.scanner.more', { count: grupos.length - visibles })}
            </button>
          )}
        </>
      )}
      <p className="text-caption text-party-gray">{t('admin.scanner.note')}</p>
    </div>
  );
};

export default AdminScanner;
