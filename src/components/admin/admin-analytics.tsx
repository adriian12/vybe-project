import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Apple, Loader2, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

/**
 * Analítica de uso y descargas (migración 152).
 *
 * `admin_analytics_report` agrupa las pantallas por sesión y por tipo de
 * persona (fiester@, invitado, sin cuenta…): qué usan, por dónde entran, dónde
 * se van y cuánto se quedan. Las cuentas de prueba, el admin, TestFlight y los
 * robots de Google no cuentan. `admin_downloads_report` da las descargas reales
 * de las tiendas (mismo criterio que el aviso de Telegram).
 */

type Segmento = 'all' | 'fiester' | 'guest' | 'explorer' | 'incomplete' | 'venue';
const SEGMENTOS: Segmento[] = ['all', 'fiester', 'guest', 'explorer', 'incomplete', 'venue'];
const PERIODOS = [7, 30, 90] as const;

interface Informe {
  resumen: {
    sesiones: number;
    personas: number;
    vistas: number;
    paginas_sesion: number;
    duracion_media: number;
    rebote: number;
    conversiones: number;
  };
  segmentos: Record<string, number>;
  por_dia: { dia: string; sesiones: number; personas: number }[];
  paginas: { ruta: string; vistas: number; sesiones: number; segundos: number | null }[];
  entradas: { ruta: string; n: number }[];
  salidas: { ruta: string; n: number; pct: number }[];
  recorridos: { desde: string; hacia: string; n: number }[];
  acciones: { nombre: string; n: number; sesiones: number }[];
  avisos_cuenta: { motivo: string; n: number; crear: number; entrar: number }[];
  plataformas: Record<string, number>;
  horas: { hora: number; n: number }[];
  desde: string | null;
}

interface Descargas {
  total: { ios: number; android: number };
  periodo: { ios: number; android: number };
  pruebas: Record<string, number>;
  altas: { fiesteros: number; invitados: number; total: number };
  por_dia: { dia: string; ios: number; android: number }[];
  versiones: { plataforma: string; version: string; n: number }[];
}

/** Nombre de cada pantalla (el servidor ya cambia los ids por `:id`). */
const PANTALLAS: Record<string, string> = {
  '/': 'welcome',
  '/bienvenida': 'onboarding',
  '/home': 'home',
  '/map': 'map',
  '/tickets': 'tickets',
  '/tickets/buy/:id': 'buyTicket',
  '/tickets/order/:id': 'ticket',
  '/compra-hecha': 'purchaseDone',
  '/matches': 'matches',
  '/likes': 'likes',
  '/chat/:id': 'chat',
  '/u/:id': 'publicProfile',
  '/location': 'location',
  '/event/:id': 'event',
  '/event/:id/live': 'live',
  '/event/:id/access': 'access',
  '/local/:id': 'venue',
  '/local/:id/dia': 'venueDay',
  '/legal': 'legal',
  '/equipo/:id': 'team',
  '/contador/:id': 'team',
  '/sala/:id': 'testRoom',
};
/** Las que tienen subpantallas (`/auth/verify-email`, `/profile/...`). */
const PREFIJOS: [string, string][] = [
  ['/profile', 'profile'],
  ['/auth', 'auth'],
  ['/admin', 'admin'],
  ['/venue/dashboard', 'panel'],
];

const fmtDuracion = (s: number | null | undefined): string => {
  if (s === null || s === undefined || Number.isNaN(s)) return '—';
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${Math.round(s % 60)} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

/** Barra horizontal con su etiqueta y su valor (una sola serie). */
const Fila = ({ label, value, max, extra }: { label: string; value: number; max: number; extra?: string }) => (
  <li>
    <div className="mb-1 flex items-baseline justify-between gap-3 text-body-sm">
      <span className="min-w-0 truncate font-semibold">{label}</span>
      <span className="shrink-0 font-bold tabular">
        {value}
        {extra && <span className="ml-2 text-caption font-normal text-muted-foreground">{extra}</span>}
      </span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-party-primary" style={{ width: `${Math.max(2, Math.round((value / Math.max(max, 1)) * 100))}%` }} />
    </div>
  </li>
);

/** Columnas por día u hora; el detalle sale al pasar el dedo o el ratón. */
const Columnas = ({ datos, etiqueta }: { datos: { clave: string; valor: number; detalle: string }[]; etiqueta: (i: number) => string | null }) => {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <div>
      <div className="flex h-28 items-end gap-[2px]">
        {datos.map((d) => (
          <div key={d.clave} className="group relative flex h-full flex-1 items-end" title={d.detalle}>
            <div
              className="w-full rounded-t-[4px] bg-party-primary/80 group-hover:bg-party-primary"
              style={{ height: d.valor > 0 ? `${Math.max(4, (d.valor / max) * 100)}%` : '0' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-muted-foreground">
        {datos.map((d, i) => (
          <span key={d.clave} className="flex-1 overflow-visible whitespace-nowrap text-center">
            {etiqueta(i) ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
};

const Dato = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
  <div className="rounded-xl bg-muted/60 p-3">
    <p className="text-caption text-muted-foreground">{label}</p>
    <p className="mt-1 font-display text-headline-md tabular">{value}</p>
    {hint && <p className="mt-0.5 text-caption text-muted-foreground">{hint}</p>}
  </div>
);

const Bloque = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <div>
      <h3 className="font-display text-title-card">{title}</h3>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </section>
);

/** Días seguidos entre `desde` y hoy, con 0 en los que no hubo nada. */
const rellenarDias = <T extends { dia: string }>(filas: T[], dias: number, vacio: Omit<T, 'dia'>): T[] => {
  const porDia = new Map(filas.map((f) => [f.dia, f]));
  const hoy = new Date();
  const out: T[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push(porDia.get(clave) ?? ({ ...vacio, dia: clave } as T));
  }
  return out;
};

const AdminAnalytics = () => {
  const { t, i18n } = useTranslation();
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [segmento, setSegmento] = useState<Segmento>('all');
  const [informe, setInforme] = useState<Informe | null>(null);
  const [descargas, setDescargas] = useState<Descargas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    void Promise.all([
      supabase.rpc('admin_analytics_report', { p_days: dias, p_segment: segmento }),
      supabase.rpc('admin_downloads_report', { p_days: dias }),
    ]).then(([uso, desc]) => {
      if (cancelado) return;
      if (uso.error || desc.error) setError(true);
      setInforme((uso.data as unknown as Informe) ?? null);
      setDescargas((desc.data as unknown as Descargas) ?? null);
      setCargando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [dias, segmento]);

  const pantalla = (ruta: string): string => {
    const clave = PANTALLAS[ruta] ?? PREFIJOS.find(([p]) => ruta.startsWith(p))?.[1];
    return clave ? t(`admin.analytics.screens.${clave}`) : ruta;
  };
  const accion = (nombre: string): string => t(`admin.analytics.actions.${nombre}`, { defaultValue: nombre });
  const fecha = (dia: string) =>
    new Date(`${dia}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });

  const r = informe?.resumen;
  const descargasPeriodo = (descargas?.periodo.ios ?? 0) + (descargas?.periodo.android ?? 0);
  const altasPeriodo = (descargas?.altas.fiesteros ?? 0) + (descargas?.altas.invitados ?? 0);
  const diasDescargas = descargas
    ? rellenarDias(descargas.por_dia, dias, { ios: 0, android: 0 })
    : [];
  const diasUso = informe ? rellenarDias(informe.por_dia, dias, { sesiones: 0, personas: 0 }) : [];
  const cadaN = dias <= 7 ? 1 : dias <= 30 ? 7 : 15;

  const periodo = (
    <div className="flex gap-1 rounded-full bg-muted p-1 text-body-sm">
      {PERIODOS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => setDias(p)}
          className={cn('rounded-full px-3 py-1 font-semibold', dias === p ? 'bg-party-primary text-ink' : 'text-muted-foreground')}
        >
          {t('admin.analytics.days', { count: p })}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-headline-md">{t('admin.analytics.title')}</h2>
          <p className="text-body-sm text-muted-foreground">{t('admin.analytics.subtitle')}</p>
        </div>
        {periodo}
      </div>

      {error && <p className="text-body-sm text-destructive">{t('admin.analytics.error')}</p>}

      {/* ------------------------------------------------------- descargas */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.analytics.downloads.title')}</CardTitle>
          <CardDescription>{t('admin.analytics.downloads.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {cargando && !descargas ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
            </div>
          ) : descargas ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Dato
                  label={t('admin.analytics.downloads.inPeriod', { count: dias })}
                  value={descargasPeriodo}
                  hint={t('admin.analytics.downloads.split', { ios: descargas.periodo.ios, android: descargas.periodo.android })}
                />
                <Dato
                  label={t('admin.analytics.downloads.total')}
                  value={descargas.total.ios + descargas.total.android}
                  hint={t('admin.analytics.downloads.split', { ios: descargas.total.ios, android: descargas.total.android })}
                />
                <Dato
                  label={t('admin.analytics.downloads.signups', { count: dias })}
                  value={altasPeriodo}
                  hint={t('admin.analytics.downloads.signupsSplit', { f: descargas.altas.fiesteros, g: descargas.altas.invitados })}
                />
                <Dato
                  label={t('admin.analytics.downloads.ratio')}
                  value={descargasPeriodo > 0 ? `${Math.round((altasPeriodo / descargasPeriodo) * 100)}%` : '—'}
                  hint={t('admin.analytics.downloads.ratioHint')}
                />
              </div>
              <Bloque title={t('admin.analytics.downloads.perDay')}>
                <Columnas
                  datos={diasDescargas.map((d) => ({
                    clave: d.dia,
                    valor: d.ios + d.android,
                    detalle: `${fecha(d.dia)} · iPhone ${d.ios} · Android ${d.android}`,
                  }))}
                  etiqueta={(i) => (i % cadaN === 0 ? fecha(diasDescargas[i].dia) : null)}
                />
              </Bloque>
              <div className="grid gap-6 md:grid-cols-2">
                <Bloque title={t('admin.analytics.downloads.versions')}>
                  <ul className="space-y-2">
                    {descargas.versiones.map((v) => (
                      <li key={`${v.plataforma}-${v.version}`} className="flex items-center justify-between gap-3 text-body-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          {v.plataforma === 'ios' ? <Apple size={14} /> : <Smartphone size={14} />}
                          <span className="truncate">{v.version}</span>
                        </span>
                        <span className="font-bold tabular">{v.n}</span>
                      </li>
                    ))}
                  </ul>
                </Bloque>
                <Bloque title={t('admin.analytics.downloads.excluded')} hint={t('admin.analytics.downloads.excludedHint')}>
                  <ul className="space-y-2 text-body-sm">
                    {Object.entries(descargas.pruebas).length === 0 && <li className="text-muted-foreground">—</li>}
                    {Object.entries(descargas.pruebas).map(([fuente, n]) => (
                      <li key={fuente} className="flex justify-between">
                        <span>{t(`admin.analytics.sources.${fuente}`, { defaultValue: fuente })}</span>
                        <span className="font-bold tabular">{n}</span>
                      </li>
                    ))}
                  </ul>
                </Bloque>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ uso */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.analytics.usage.title')}</CardTitle>
          <CardDescription>{t('admin.analytics.usage.subtitle')}</CardDescription>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pt-2" role="tablist">
            {SEGMENTOS.map((s) => {
              const n =
                s === 'all'
                  ? Object.entries(informe?.segmentos ?? {})
                      .filter(([k]) => k !== 'admin')
                      .reduce((a, [, v]) => a + v, 0)
                  : (informe?.segmentos?.[s] ?? 0);
              return (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={segmento === s}
                  onClick={() => setSegmento(s)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1.5 text-body-sm font-semibold',
                    segmento === s ? 'border-party-primary bg-party-primary text-ink' : 'border-border text-muted-foreground',
                  )}
                >
                  {t(`admin.analytics.segments.${s}`)}
                  {informe && <span className="ml-1.5 tabular opacity-70">{n}</span>}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {cargando ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
            </div>
          ) : !informe || !r || r.sesiones === 0 ? (
            <p className="text-body-sm text-muted-foreground">
              {t('admin.analytics.usage.empty')}
              {informe?.desde ? ` ${t('admin.analytics.usage.since', { date: new Date(informe.desde).toLocaleDateString(i18n.language) })}` : ''}
            </p>
          ) : (
            <>
              <p className="text-caption text-muted-foreground">{t(`admin.analytics.segmentHints.${segmento}`)}</p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <Dato label={t('admin.analytics.usage.sessions')} value={r.sesiones} />
                <Dato label={t('admin.analytics.usage.people')} value={r.personas} />
                <Dato label={t('admin.analytics.usage.pagesPerSession')} value={r.paginas_sesion} />
                <Dato label={t('admin.analytics.usage.avgDuration')} value={fmtDuracion(r.duracion_media)} />
                <Dato label={t('admin.analytics.usage.bounce')} value={`${r.rebote}%`} hint={t('admin.analytics.usage.bounceHint')} />
                {segmento === 'explorer' || segmento === 'all' ? (
                  <Dato label={t('admin.analytics.usage.converted')} value={r.conversiones} hint={t('admin.analytics.usage.convertedHint')} />
                ) : (
                  <Dato label={t('admin.analytics.usage.views')} value={r.vistas} />
                )}
              </div>

              <Bloque title={t('admin.analytics.usage.perDay')}>
                <Columnas
                  datos={diasUso.map((d) => ({
                    clave: d.dia,
                    valor: d.sesiones,
                    detalle: t('admin.analytics.usage.dayDetail', { date: fecha(d.dia), s: d.sesiones, p: d.personas }),
                  }))}
                  etiqueta={(i) => (i % cadaN === 0 ? fecha(diasUso[i].dia) : null)}
                />
              </Bloque>

              <Bloque title={t('admin.analytics.usage.topScreens')} hint={t('admin.analytics.usage.topScreensHint')}>
                <ul className="space-y-3">
                  {informe.paginas.map((p) => (
                    <Fila
                      key={p.ruta}
                      label={pantalla(p.ruta)}
                      value={p.vistas}
                      max={informe.paginas[0]?.vistas ?? 1}
                      extra={t('admin.analytics.usage.screenExtra', { s: p.sesiones, time: fmtDuracion(p.segundos) })}
                    />
                  ))}
                </ul>
              </Bloque>

              <div className="grid gap-8 md:grid-cols-2">
                <Bloque title={t('admin.analytics.usage.entries')} hint={t('admin.analytics.usage.entriesHint')}>
                  <ul className="space-y-3">
                    {informe.entradas.map((p) => (
                      <Fila key={p.ruta} label={pantalla(p.ruta)} value={p.n} max={informe.entradas[0]?.n ?? 1} />
                    ))}
                  </ul>
                </Bloque>
                <Bloque title={t('admin.analytics.usage.exits')} hint={t('admin.analytics.usage.exitsHint')}>
                  <ul className="space-y-3">
                    {informe.salidas.map((p) => (
                      <Fila
                        key={p.ruta}
                        label={pantalla(p.ruta)}
                        value={p.n}
                        max={informe.salidas[0]?.n ?? 1}
                        extra={t('admin.analytics.usage.exitRate', { pct: p.pct })}
                      />
                    ))}
                  </ul>
                </Bloque>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <Bloque title={t('admin.analytics.usage.paths')} hint={t('admin.analytics.usage.pathsHint')}>
                  <ul className="space-y-2 text-body-sm">
                    {informe.recorridos.length === 0 && <li className="text-muted-foreground">—</li>}
                    {informe.recorridos.map((p) => (
                      <li key={`${p.desde}>${p.hacia}`} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {pantalla(p.desde)} <span className="text-muted-foreground">→</span> {pantalla(p.hacia)}
                        </span>
                        <span className="font-bold tabular">{p.n}</span>
                      </li>
                    ))}
                  </ul>
                </Bloque>
                <Bloque title={t('admin.analytics.usage.actions')} hint={t('admin.analytics.usage.actionsHint')}>
                  <ul className="space-y-3">
                    {informe.acciones.length === 0 && <li className="text-body-sm text-muted-foreground">—</li>}
                    {informe.acciones.map((a) => (
                      <Fila
                        key={a.nombre}
                        label={accion(a.nombre)}
                        value={a.n}
                        max={informe.acciones[0]?.n ?? 1}
                        extra={t('admin.analytics.usage.inSessions', { count: a.sesiones })}
                      />
                    ))}
                  </ul>
                </Bloque>
              </div>

              {(segmento === 'explorer' || segmento === 'all') && informe.avisos_cuenta.length > 0 && (
                <Bloque title={t('admin.analytics.usage.walls')} hint={t('admin.analytics.usage.wallsHint')}>
                  <ul className="space-y-3">
                    {informe.avisos_cuenta.map((a) => (
                      <Fila
                        key={a.motivo}
                        label={t(`admin.analytics.reasons.${a.motivo}`, { defaultValue: a.motivo })}
                        value={a.n}
                        max={informe.avisos_cuenta[0]?.n ?? 1}
                        extra={t('admin.analytics.usage.wallExtra', { c: a.crear, l: a.entrar })}
                      />
                    ))}
                  </ul>
                </Bloque>
              )}

              <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
                <Bloque title={t('admin.analytics.usage.platforms')}>
                  <ul className="space-y-3">
                    {Object.entries(informe.plataformas)
                      .sort((a, b) => b[1] - a[1])
                      .map(([plat, n]) => (
                        <Fila
                          key={plat}
                          label={t(`admin.analytics.platforms.${plat}`, { defaultValue: plat })}
                          value={n}
                          max={Math.max(...Object.values(informe.plataformas), 1)}
                        />
                      ))}
                  </ul>
                </Bloque>
                <Bloque title={t('admin.analytics.usage.hours')} hint={t('admin.analytics.usage.hoursHint')}>
                  <Columnas
                    datos={Array.from({ length: 24 }, (_, h) => {
                      const n = informe.horas.find((x) => x.hora === h)?.n ?? 0;
                      return { clave: String(h), valor: n, detalle: t('admin.analytics.usage.hourDetail', { h, n }) };
                    })}
                    etiqueta={(i) => (i % 3 === 0 ? `${i}h` : null)}
                  />
                </Bloque>
              </div>

              {informe.desde && (
                <p className="text-caption text-muted-foreground">
                  {t('admin.analytics.usage.since', { date: new Date(informe.desde).toLocaleDateString(i18n.language) })}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAnalytics;
