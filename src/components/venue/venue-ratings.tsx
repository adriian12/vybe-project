import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { nota, ratingsService, VenueRatings as Datos } from '@/services/ratings';
import type { VenuePlanStatus } from '@/services/venue-service';
import { planHas } from '@/lib/venue-plans';
import { cn } from '@/lib/utils';

/**
 * Lo que opinan los clientes (Pro y Business): media general y por música,
 * ambiente y precio, reparto de estrellas, nota de cada noche y los
 * comentarios, siempre sin nombre.
 *
 * Las valoraciones las deja quien estuvo dentro, al salir o cuando termina la
 * fiesta. En el plan gratuito se enseña qué incluye y el botón de mejorar.
 */
const VenueRatings = ({ plan }: { plan: VenuePlanStatus | null }) => {
  const { t } = useTranslation();
  const disponible = planHas(plan?.plan, 'ratings');
  const [datos, setDatos] = useState<Datos | null>(null);

  useEffect(() => {
    if (!disponible) return;
    let vivo = true;
    ratingsService
      .getVenue()
      .then((d) => {
        if (vivo) setDatos(d);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [disponible]);

  const Titulo = (
    <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
      <Star size={17} />
      {t('rating.venue.title')}
    </h3>
  );

  // Sin Pro ni Business no se enseña (antes salía un aviso de mejorar plan).
  if (!disponible) return null;

  if (!datos) return null;
  const { summary, distribution, nights, comments } = datos;

  if (summary.count === 0) {
    return (
      <div className="surface-light rounded-2xl p-4">
        {Titulo}
        <p className="mt-2 text-body-sm text-party-gray">{t('rating.venue.empty')}</p>
      </div>
    );
  }

  const maximo = Math.max(...distribution.map((d) => d.count), 1);
  const tendencia =
    summary.last30 !== null && summary.prev30 !== null ? Number((summary.last30 - summary.prev30).toFixed(1)) : null;

  const detalle = [
    { key: 'music', value: summary.music },
    { key: 'atmosphere', value: summary.atmosphere },
    { key: 'price', value: summary.price },
  ];

  // Va en la columna estrecha del panel: siempre una sola columna, sea cual
  // sea el ancho de la pantalla.
  return (
    <div className="space-y-4">
      <div className="surface-light min-w-0 space-y-4 rounded-2xl p-4">
        {Titulo}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="font-display text-[44px] font-extrabold leading-none tabular">
            {summary.overall !== null ? nota(summary.overall) : '—'}
          </p>
          <div className="min-w-0">
            <p className="flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={16}
                  className={cn(
                    n <= Math.round(summary.overall ?? 0) ? 'fill-party-primary text-party-primary' : 'text-black/15',
                  )}
                />
              ))}
            </p>
            <p className="text-caption text-party-gray">{t('rating.venue.count', { count: summary.count })}</p>
          </div>
          {tendencia !== null && tendencia !== 0 && (
            <span
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-0.5 text-caption font-bold',
                tendencia > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-destructive/10 text-destructive',
              )}
            >
              {tendencia > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {tendencia > 0 ? '+' : ''}
              {nota(tendencia)} {t('rating.venue.vsPrev')}
            </span>
          )}
        </div>

        <ul className="space-y-1.5">
          {distribution.map((d) => (
            <li key={d.stars} className="flex items-center gap-2 text-caption">
              <span className="w-3 text-right font-bold">{d.stars}</span>
              <Star size={12} className="fill-party-primary text-party-primary" />
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.08]">
                <span className="block h-full rounded-full bg-party-primary" style={{ width: `${(d.count / maximo) * 100}%` }} />
              </span>
              <span className="w-8 text-right tabular text-party-gray">{d.count}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-3 gap-2">
          {detalle.map((item) => (
            <div key={item.key} className="min-w-0 rounded-xl bg-black/[0.04] px-1 py-2 text-center">
              <p className="font-display text-title-card tabular">{item.value !== null ? nota(item.value) : '—'}</p>
              <p className="truncate text-[11px] text-party-gray">{t(`rating.${item.key}`)}</p>
            </div>
          ))}
        </div>
      </div>

        {nights.length > 0 && (
          <div className="surface-light rounded-2xl p-4">
            <h3 className="mb-2 font-display text-title-card uppercase tracking-wide">{t('rating.venue.byNight')}</h3>
            <ul className="divide-y divide-black/[0.06]">
              {nights.map((n) => (
                <li key={n.eventId} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-bold">{n.name}</p>
                    <p className="text-caption text-party-gray">
                      {new Date(n.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ·{' '}
                      {t('rating.venue.count', { count: n.count })}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 font-bold tabular">
                    <Star size={14} className="fill-party-primary text-party-primary" />
                    {nota(n.avg)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Comentarios comments={comments} />
    </div>
  );
};

/** A partir de aquí un comentario se recorta y sale «Leer más». */
const LARGO = 180;

/**
 * Los comentarios, de uno en uno: el total junto al título, flechas para
 * pasar al anterior o al siguiente (o deslizar con el dedo) y «Leer más» en
 * los largos.
 */
const Comentarios = ({ comments }: { comments: Datos['comments'] }) => {
  const { t } = useTranslation();
  const [actual, setActual] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const inicioX = useRef<number | null>(null);

  const total = comments.length;
  const indice = Math.min(actual, Math.max(total - 1, 0));
  const ir = (paso: number) => {
    if (total < 2) return;
    setActual((indice + paso + total) % total);
    setAbierto(false);
  };

  const c = comments[indice];
  const largo = Boolean(c && c.comment.length > LARGO);

  return (
    <div className="surface-light min-w-0 rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-display text-title-card uppercase tracking-wide">{t('rating.venue.comments')}</h3>
        {total > 1 && (
          <span className="rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[11px] font-bold tabular text-party-gray">
            {total}
          </span>
        )}
      </div>

      {!c ? (
        <p className="text-body-sm text-party-gray">{t('rating.venue.noComments')}</p>
      ) : (
        <>
          <div
            className="rounded-xl bg-black/[0.03] p-3"
            onTouchStart={(e) => {
              inicioX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (inicioX.current === null) return;
              const dx = e.changedTouches[0].clientX - inicioX.current;
              inicioX.current = null;
              if (Math.abs(dx) > 40) ir(dx < 0 ? 1 : -1);
            }}
          >
            <p className="flex min-w-0 items-center gap-1 text-caption text-party-gray">
              <Star size={12} className="shrink-0 fill-party-primary text-party-primary" />
              <span className="shrink-0 font-bold text-ink">{c.overall}</span>
              <span className="truncate">
                · {c.eventName} ·{' '}
                {new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </span>
            </p>
            <p className={cn('mt-1 whitespace-pre-line break-words text-body-sm', largo && !abierto && 'line-clamp-4')}>
              {c.comment}
            </p>
            {largo && (
              <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                className="press mt-1 text-caption font-bold underline"
              >
                {t(abierto ? 'rating.venue.readLess' : 'rating.venue.readMore')}
              </button>
            )}
          </div>

          {total > 1 && (
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => ir(-1)}
                aria-label={t('rating.venue.prevComment')}
                className="press flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.06]"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-caption tabular text-party-gray">
                {indice + 1} / {total}
              </span>
              <button
                type="button"
                onClick={() => ir(1)}
                aria-label={t('rating.venue.nextComment')}
                className="press flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.06]"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VenueRatings;
