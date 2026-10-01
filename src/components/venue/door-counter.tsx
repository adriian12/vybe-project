import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CloudOff, Loader2, Minus, Pencil, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/services/api';
import { CounterError, CounterState, CounterTransport } from '@/services/door-counter';
import { cn } from '@/lib/utils';

interface DoorCounterProps {
  transport: CounterTransport;
  /** `panel`: tarjeta clara del panel. `full`: la pantalla entera del portero. */
  variant?: 'panel' | 'full';
  /** Cada vez que llega el estado del servidor (para la cabecera de la página). */
  onState?: (state: CounterState) => void;
  /** Un error que no se arregla reintentando: enlace caducado, evento cerrado… */
  onFatal?: (code: string) => void;
  /** Sin la cifra ni la barra: en el panel ya las enseña la primera tarjeta de Puerta. */
  hideSummary?: boolean;
}

/** Cada cuánto se mandan las pulsaciones acumuladas. */
const FLUSH_MS = 900;
/** Cada cuánto se relee el total (por si cuenta otro portero). */
const POLL_MS = 15_000;
/** Lo más que acepta el servidor de golpe (`apply_event_headcount`). */
const MAX_CHUNK = 20;

const FINAL_CODES = ['INVALID_LINK', 'EVENT_NOT_LIVE', 'CAPACITY_REQUIRED', 'INVALID_TOTAL', 'INVALID_DELTA'];

const storageKey = (key: string) => `vybe_counter_${key}`;

const readPending = (key: string): number => {
  try {
    const value = Number(window.localStorage.getItem(storageKey(key)));
    return Number.isInteger(value) ? value : 0;
  } catch {
    return 0;
  }
};

const writePending = (key: string, value: number) => {
  try {
    if (value === 0) window.localStorage.removeItem(storageKey(key));
    else window.localStorage.setItem(storageKey(key), String(value));
  } catch {
    // Sin almacenamiento, las pulsaciones pendientes sólo viven en memoria.
  }
};

/** El código de un error que no merece reintento, o null si es de red. */
const finalCode = (error: unknown): string | null => {
  if (error instanceof CounterError) return error.code;
  if (error instanceof ApiError && FINAL_CODES.includes(error.code)) return error.code;
  return null;
};

const vibrate = () => {
  try {
    navigator.vibrate?.(12);
  } catch {
    // Hay navegadores que no vibran; no pasa nada.
  }
};

/**
 * El contador de la puerta: +1 por cada persona que entra, −1 por cada una que
 * sale.
 *
 * Está hecho para una puerta de discoteca: con una mano, sin mirar, con mala
 * cobertura. Por eso:
 *
 *   - La cifra cambia al instante y las pulsaciones se mandan agrupadas cada
 *     segundo, no una petición por toque.
 *   - Sin red, se guardan en el navegador y salen solas al volver la conexión;
 *     recargar la página no las pierde.
 *   - Dos porteros pueden contar a la vez: el servidor suma, no sobrescribe, y
 *     cada quince segundos se relee el total.
 *   - En la pantalla del portero se pide que la pantalla no se apague.
 */
const DoorCounter = ({ transport, variant = 'panel', onState, onFatal, hideSummary = false }: DoorCounterProps) => {
  const { t } = useTranslation();
  const full = variant === 'full';

  const [server, setServer] = useState<CounterState | null>(null);
  const [pending, setPending] = useState(() => readPending(transport.key));
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctValue, setCorrectValue] = useState('');

  const pendingRef = useRef(pending);
  const serverRef = useRef<CounterState | null>(null);
  const inFlight = useRef(false);
  const callbacks = useRef({ onState, onFatal });
  callbacks.current = { onState, onFatal };

  const updatePending = useCallback(
    (value: number) => {
      pendingRef.current = value;
      writePending(transport.key, value);
      setPending(value);
    },
    [transport.key],
  );

  // Fuera del actualizador de estado: avisar al padre desde dentro de él sería
  // actualizar otro componente mientras React pinta este.
  const receive = useCallback((next: Partial<CounterState>) => {
    const merged: CounterState = {
      total: 0,
      capacity: null,
      inside: 0,
      updatedAt: null,
      ...serverRef.current,
      ...next,
    };
    serverRef.current = merged;
    setServer(merged);
    callbacks.current.onState?.(merged);
  }, []);

  const fail = useCallback(
    (reason: unknown) => {
      const code = finalCode(reason);
      if (code) {
        updatePending(0);
        setError(code);
        callbacks.current.onFatal?.(code);
      } else {
        setOffline(true);
      }
    },
    [updatePending],
  );

  // --------------------------------------------------------------- lectura
  // Con pulsaciones sin mandar también se lee: la cifra que se enseña es la del
  // servidor más las pendientes. Sólo se evita leer mientras sale un envío.
  const load = useCallback(async () => {
    if (inFlight.current) return;
    try {
      receive(await transport.load());
      setOffline(false);
    } catch (reason) {
      fail(reason);
    }
  }, [transport, receive, fail]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  // ---------------------------------------------------------------- envío
  useEffect(() => {
    const interval = setInterval(async () => {
      if (inFlight.current || pendingRef.current === 0) return;

      const chunk = Math.max(-MAX_CHUNK, Math.min(MAX_CHUNK, pendingRef.current));
      inFlight.current = true;
      setSending(true);
      try {
        const result = await transport.adjust(chunk);
        updatePending(pendingRef.current - chunk);
        receive(result);
        setOffline(false);
        setError(null);
      } catch (reason) {
        fail(reason);
      } finally {
        inFlight.current = false;
        setSending(false);
      }
    }, FLUSH_MS);
    return () => clearInterval(interval);
  }, [transport, receive, fail, updatePending]);

  // Al volver la red se manda lo pendiente sin esperar al siguiente intento.
  useEffect(() => {
    const online = () => setOffline(false);
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, []);

  // --------------------------------------------- pantalla siempre encendida
  useEffect(() => {
    if (!full || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;

    const pedir = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // El navegador puede negarlo (batería baja); se cuenta igual.
      }
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') void pedir();
    };

    void pedir();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      void lock?.release().catch(() => undefined);
    };
  }, [full]);

  const total = Math.max(0, (server?.total ?? 0) + pending);
  const capacity = server?.capacity ?? null;
  const ratio = capacity ? total / capacity : null;
  const percent = ratio !== null ? Math.round(ratio * 100) : null;
  const inside = server?.inside ?? 0;
  // Con menos gente contada que con Vybe dentro (se empezó a contar tarde) el
  // porcentaje sería mentira: se avisa para corregir el total.
  const pocoContado = server !== null && inside > total;
  const share = total > 0 && !pocoContado ? Math.round((inside / total) * 100) : null;
  const locked = error === 'INVALID_LINK' || error === 'EVENT_NOT_LIVE' || error === 'CAPACITY_REQUIRED';

  const tap = (delta: number) => {
    if (locked || !server) return;
    // No se baja de cero: restar con la sala vacía es un toque sin querer.
    if (total + delta < 0) return;
    vibrate();
    updatePending(pendingRef.current + delta);
  };

  const correct = async () => {
    const value = Number(correctValue);
    if (!Number.isInteger(value) || value < 0) return;
    updatePending(0);
    inFlight.current = true;
    setSending(true);
    try {
      receive(await transport.set(value));
      setCorrecting(false);
      setCorrectValue('');
      setError(null);
    } catch (reason) {
      fail(reason);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const minutos = server?.updatedAt
    ? Math.max(0, Math.round((Date.now() - new Date(server.updatedAt).getTime()) / 60_000))
    : null;

  const estado = offline ? (
    <span className="flex items-center gap-1.5 text-party-accent">
      <CloudOff size={14} />
      {t('counter.offline', { count: Math.abs(pending) })}
    </span>
  ) : sending || pending !== 0 ? (
    <span className="flex items-center gap-1.5">
      <Loader2 size={14} className="animate-spin" />
      {t('counter.sending')}
    </span>
  ) : (
    <span className="flex items-center gap-1.5">
      <Check size={14} />
      {minutos === null ? t('counter.notStarted') : minutos < 1 ? t('counter.synced') : t('counter.syncedAgo', { minutes: minutos })}
    </span>
  );

  if (!server && !error) {
    return (
      <div className={cn('flex justify-center', full ? 'py-24' : 'py-6')}>
        <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
      </div>
    );
  }

  const botonBase =
    'press flex items-center justify-center gap-2 rounded-2xl font-display font-extrabold tabular disabled:opacity-40';

  return (
    <div className={cn(full ? 'flex flex-1 flex-col gap-5' : 'space-y-3')}>
      {/* ---------------------------------------------------------- cifra */}
      <div className={cn(full && 'text-center', hideSummary && 'sr-only')}>
        <p
          aria-live="polite"
          className={cn('font-display font-extrabold leading-none tabular', full ? 'text-[84px]' : 'text-[44px]')}
        >
          {total}
        </p>
        {capacity !== null && (
          <p className={cn('mt-1 text-party-gray', full ? 'text-body-md' : 'text-body-sm')}>
            {t('counter.ofCapacity', { capacity })}
            {percent !== null && ` · ${t('counter.percent', { percent })}`}
          </p>
        )}
        {ratio !== null && (
          <div
            className={cn(
              'mt-3 h-2.5 w-full overflow-hidden rounded-full',
              full ? 'bg-white/[0.08]' : 'bg-black/[0.08]',
            )}
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300',
                ratio >= 0.95 ? 'bg-destructive' : ratio >= 0.7 ? 'bg-party-accent' : 'bg-party-primary',
              )}
              style={{ width: `${Math.min(ratio * 100, 100)}%` }}
            />
          </div>
        )}
        <p className={cn('mt-2 text-caption', full ? 'text-party-gray' : 'text-party-gray')}>
          {share !== null
            ? t('counter.withVybe', { count: inside, percent: share })
            : t('counter.withVybeNoPct', { count: inside })}
        </p>
      </div>

      {pocoContado && !error && (
        <p className="rounded-xl bg-party-accent/20 px-3 py-2 text-body-sm font-bold">
          {t('counter.belowVybe', { count: inside })}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/15 px-3 py-2 text-body-sm font-bold text-destructive">
          {t(`counter.errors.${error}`, { defaultValue: t('counter.errors.generic') })}
        </p>
      )}

      {/* -------------------------------------------------------- botones */}
      <div className={cn('grid gap-3', full ? 'mt-auto grid-cols-2' : 'grid-cols-3')}>
        <button
          type="button"
          disabled={locked}
          onClick={() => tap(1)}
          aria-label={t('counter.add')}
          className={cn(
            botonBase,
            'bg-party-primary text-ink',
            full ? 'col-span-2 h-32 text-[52px]' : 'order-2 h-14 text-headline-md',
          )}
        >
          <Plus size={full ? 44 : 22} strokeWidth={3} />1
        </button>
        <button
          type="button"
          disabled={locked || total === 0}
          onClick={() => tap(-1)}
          aria-label={t('counter.remove')}
          className={cn(
            botonBase,
            full ? 'h-20 bg-surface-high text-[32px] text-foreground' : 'order-1 h-14 bg-black/[0.07] text-headline-md',
          )}
        >
          <Minus size={full ? 32 : 22} strokeWidth={3} />1
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={() => tap(5)}
          aria-label={t('counter.addFive')}
          className={cn(
            botonBase,
            full ? 'h-20 bg-surface-high text-[32px] text-foreground' : 'order-3 h-14 bg-black/[0.07] text-headline-md',
          )}
        >
          <Plus size={full ? 32 : 22} strokeWidth={3} />5
        </button>
      </div>

      {/* ------------------------------------------------ estado y corrección */}
      <div className={cn('flex items-center justify-between gap-3 text-caption', full ? 'text-party-gray' : 'text-party-gray')}>
        {estado}
        {!locked && !correcting && (
          <button
            type="button"
            onClick={() => {
              setCorrectValue(String(total));
              setCorrecting(true);
            }}
            className="press flex items-center gap-1 font-bold underline underline-offset-2"
          >
            <Pencil size={13} />
            {t('counter.correct')}
          </button>
        )}
      </div>

      {correcting && (
        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            autoFocus
            value={correctValue}
            onChange={(e) => setCorrectValue(e.target.value)}
            aria-label={t('counter.correctPlaceholder')}
            placeholder={t('counter.correctPlaceholder')}
            className="h-11"
          />
          <button
            type="button"
            disabled={sending || correctValue === ''}
            onClick={() => void correct()}
            className="press h-11 shrink-0 rounded-xl bg-party-primary px-4 font-display text-title-card text-ink disabled:opacity-40"
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            onClick={() => setCorrecting(false)}
            className="press h-11 shrink-0 rounded-xl px-3 text-body-sm text-party-gray"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
};

export default DoorCounter;
