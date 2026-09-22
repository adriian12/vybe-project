import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, TrendingDown, CalendarDays, Loader2, Crown, Users, DoorOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/services/api';
import {
  venueService,
  DemographicBucket,
  WeekdayStats,
  DropoffPoint,
  HeadcountPoint,
  VenuePlanStatus,
} from '@/services/venue-service';

interface VenueInsightsProps {
  eventId: string;
  venueId: string;
  plan: VenuePlanStatus | null;
  onUpgrade: () => void;
}

/** Barra horizontal simple. Evita meter una librería de gráficos por tres vistas. */
const Bar = ({
  value,
  max,
  tone = 'primary',
}: {
  value: number;
  max: number;
  tone?: 'primary' | 'muted' | 'danger';
}) => {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  const color =
    tone === 'danger' ? 'bg-destructive' : tone === 'muted' ? 'bg-muted-foreground/40' : 'bg-party-primary';

  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
};

/**
 * Las tres preguntas que un local se hace el lunes por la mañana: quién vino,
 * qué noche funciona mejor y a qué hora se vació la sala.
 *
 * La demografía va agregada y con un mínimo de personas por grupo. Por debajo
 * de ese mínimo el grupo señalaría a individuos concretos, así que el servidor
 * ni lo devuelve.
 */
const VenueInsights = ({ eventId, venueId, plan, onUpgrade }: VenueInsightsProps) => {
  const { t } = useTranslation();

  const [demographics, setDemographics] = useState<DemographicBucket[]>([]);
  const [demographicsBlocked, setDemographicsBlocked] = useState(false);
  const [weekdays, setWeekdays] = useState<WeekdayStats[]>([]);
  const [dropoff, setDropoff] = useState<DropoffPoint[]>([]);
  const [headcount, setHeadcount] = useState<HeadcountPoint[]>([]);
  const [headcountBlocked, setHeadcountBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const [nights, curve] = await Promise.all([
      venueService.getWeekdayStats(venueId),
      venueService.getDropoff(eventId),
    ]);
    setWeekdays(nights);
    setDropoff(curve);

    try {
      setDemographics(await venueService.getDemographics(eventId));
      setDemographicsBlocked(false);
    } catch (error) {
      // El plan no la incluye: no es un fallo, es una función que no ha contratado.
      setDemographicsBlocked(
        error instanceof ApiError && error.code === 'PLAN_UPGRADE_REQUIRED',
      );
      setDemographics([]);
    }

    try {
      setHeadcount(await venueService.getHeadcountCurve(eventId));
      setHeadcountBlocked(false);
    } catch (error) {
      setHeadcountBlocked(error instanceof ApiError && error.code === 'PLAN_REQUIRED');
      setHeadcount([]);
    }

    setIsLoading(false);
  }, [eventId, venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-party-primary" />
      </div>
    );
  }

  const maxPeople = Math.max(...demographics.map((d) => d.people), 1);
  const maxNight = Math.max(...weekdays.map((w) => w.avgCheckIns), 1);
  const maxPresent = Math.max(...dropoff.map((d) => d.present), 1);
  const peak = dropoff.reduce<DropoffPoint | null>(
    (best, point) => (!best || point.present > best.present ? point : best),
    null,
  );

  // Curva de la puerta: sólo los tramos en los que ya se contaba.
  const tramos = headcount.filter((point) => point.total !== null);
  const maxTotal = Math.max(...tramos.map((point) => point.total ?? 0), 1);
  const picoPuerta = tramos.reduce<HeadcountPoint | null>(
    (best, point) => (!best || (point.total ?? 0) > (best.total ?? 0) ? point : best),
    null,
  );
  const cuota = (point: HeadcountPoint) =>
    point.total ? Math.round((Math.min(point.vybe, point.total) / point.total) * 100) : 0;
  const cuotaMedia = tramos.length
    ? Math.round(tramos.reduce((sum, point) => sum + cuota(point), 0) / tramos.length)
    : null;
  const horaDe = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  // Tres tarjetas blancas: en el móvil una debajo de otra y en escritorio en
  // fila, como la cuadrícula de «Estadísticas y Métricas» de Stitch.
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ---------------------------------------------------------------- */}
      {/* Quién vino                                                      */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-title-card uppercase tracking-wide">
            <Users size={16} className="text-party-primary" />
            {t('venue.insights.demographicsTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t('venue.insights.demographicsSubtitle')}
          </p>
        </CardHeader>

        <CardContent>
          {demographicsBlocked ? (
            <button
              type="button"
              onClick={onUpgrade}
              className="press flex w-full items-center justify-center gap-2 rounded-lg bg-party-primary py-3 text-caption font-bold text-ink"
            >
              <Crown size={14} />
              {t('venue.insights.demographicsNeedsPlan')}
            </button>
          ) : demographics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('venue.insights.demographicsEmpty')}
            </p>
          ) : (
            <ul className="space-y-3">
              {demographics.map((row) => (
                <li key={`${row.bucket}-${row.gender}`}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>
                      {row.bucket}
                      <span className="text-muted-foreground">
                        {' · '}
                        {t(`venue.insights.genders.${row.gender}`, { defaultValue: row.gender })}
                      </span>
                    </span>
                    <strong>{row.people}</strong>
                  </div>
                  <Bar value={row.people} max={maxPeople} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Qué noche funciona                                              */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-title-card uppercase tracking-wide">
            <CalendarDays size={16} className="text-party-primary" />
            {t('venue.insights.weekdaysTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('venue.insights.weekdaysSubtitle')}</p>
        </CardHeader>

        <CardContent>
          {weekdays.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('venue.insights.weekdaysEmpty')}</p>
          ) : (
            <ul className="space-y-3">
              {weekdays.map((night) => (
                <li key={night.weekday}>
                  <div className="flex items-center justify-between text-sm mb-1 gap-2">
                    <span className="capitalize truncate">
                      {t(`venue.insights.weekdayNames.${night.weekday}`)}
                      {night.bestTheme && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          {night.bestTheme}
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0">
                      <strong>{night.avgCheckIns}</strong>
                      <span className="text-muted-foreground text-xs">
                        {' '}
                        {t('venue.insights.avgPerNight', { count: night.events })}
                      </span>
                    </span>
                  </div>
                  <Bar value={night.avgCheckIns} max={maxNight} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* A qué hora se vacía                                             */}
      {/* ---------------------------------------------------------------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-title-card uppercase tracking-wide">
            <TrendingDown size={16} className="text-party-primary" />
            {t('venue.insights.dropoffTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('venue.insights.dropoffSubtitle')}</p>
        </CardHeader>

        <CardContent>
          {dropoff.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('venue.insights.dropoffEmpty')}</p>
          ) : (
            <>
              {peak && peak.present > 0 && (
                <p className="mb-3 text-sm">
                  {t('venue.insights.peak', {
                    time: new Date(peak.hour).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    count: peak.present,
                  })}
                </p>
              )}

              <ul className="space-y-2">
                {dropoff.map((point) => (
                  <li key={point.hour} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {new Date(point.hour).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <div className="flex-1">
                      <Bar value={point.present} max={maxPresent} />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                      <strong>{point.present}</strong>
                      {point.left > 0 && (
                        <span className="text-destructive"> −{point.left}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Aforo real frente a Vybe (Pro y Business)                        */}
      {/* ---------------------------------------------------------------- */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-title-card uppercase tracking-wide">
            <DoorOpen size={16} className="text-party-primary" />
            {t('venue.insights.headcountTitle')}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('venue.insights.headcountSubtitle')}</p>
        </CardHeader>

        <CardContent>
          {headcountBlocked ? (
            <button
              type="button"
              onClick={onUpgrade}
              className="press flex w-full items-center justify-center gap-2 rounded-lg bg-party-primary py-3 text-caption font-bold text-ink"
            >
              <Crown size={14} />
              {t('venue.insights.headcountNeedsPlan')}
            </button>
          ) : tramos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('venue.insights.headcountEmpty')}</p>
          ) : (
            <>
              <p className="mb-3 text-sm">
                {picoPuerta &&
                  t('venue.insights.headcountPeak', {
                    time: horaDe(picoPuerta.bucket),
                    count: picoPuerta.total ?? 0,
                  })}
                {cuotaMedia !== null && ` ${t('venue.insights.headcountShare', { percent: cuotaMedia })}`}
              </p>
              <ul className="grid gap-x-6 gap-y-2 lg:grid-cols-2">
                {tramos.map((point) => (
                  <li key={point.bucket} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {horaDe(point.bucket)}
                    </span>
                    {/* Barra del total de la puerta y, dentro, la parte con Vybe. */}
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-party-primary"
                        style={{ width: `${Math.round(((point.total ?? 0) / maxTotal) * 100)}%` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-ink/70"
                        style={{ width: `${Math.round((Math.min(point.vybe, point.total ?? 0) / maxTotal) * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums">
                      <strong>{point.total}</strong>
                      <span className="text-muted-foreground"> · {point.vybe} Vybes</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 px-1 text-caption text-party-gray lg:col-span-3">
        <BarChart3 size={13} className="shrink-0 mt-0.5" />
        {t('venue.insights.privacyNote')}
      </p>
    </div>
  );
};

export default VenueInsights;
