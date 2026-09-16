import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface FunnelStep {
  key: string;
  value: number;
}

const DAYS = 30;

/**
 * Embudo de activación de los últimos 30 días.
 *
 * Se calcula sobre las tablas del producto, no sobre eventos de analítica, para
 * que funcione aunque no haya un proveedor externo configurado.
 */
const AdminMetrics = () => {
  const { t } = useTranslation();

  const [steps, setSteps] = useState<FunnelStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

      const countOf = async (
        table: 'profiles' | 'event_attendance' | 'swipes' | 'connections' | 'messages',
        column: string,
        extra?: (query: ReturnType<typeof supabase.from>) => unknown,
      ): Promise<number> => {
        let query = supabase
          .from(table)
          // head:true evita traer filas: sólo queremos el contador.
          .select(column, { count: 'exact', head: true })
          .gte('created_at', since);

        if (extra) query = extra(query as never) as typeof query;

        const { count } = await query;
        return count ?? 0;
      };

      // Los dos primeros escalones salen de `auth.users`, que el navegador no
      // puede leer: cuánta gente crea la cuenta y cuánta llega a confirmar el
      // correo. Sin eso, la pérdida más cara del producto quedaba fuera del
      // embudo, porque ocurre antes de que exista el perfil.
      const [alta, verified, checkedIn, swiped, matched, messaged] = await Promise.all([
        supabase
          .rpc('get_signup_funnel', { p_days: DAYS })
          .then((r) => r.data?.[0] ?? null),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', since)
          .eq('is_verified', true)
          .then((r) => r.count ?? 0),
        supabase
          .from('event_attendance')
          .select('profile_id', { count: 'exact', head: true })
          .gte('checked_in_at', since)
          .then((r) => r.count ?? 0),
        countOf('swipes', 'id'),
        countOf('connections', 'id'),
        countOf('messages', 'id'),
      ]);

      if (cancelled) return;

      setSteps([
        { key: 'admin.metrics.accounts', value: Number(alta?.accounts ?? 0) },
        { key: 'admin.metrics.confirmed', value: Number(alta?.confirmed ?? 0) },
        { key: 'admin.metrics.signups', value: Number(alta?.with_photo ?? 0) },
        { key: 'admin.metrics.verified', value: verified },
        { key: 'admin.metrics.checkedIn', value: checkedIn },
        { key: 'admin.metrics.swiped', value: swiped },
        { key: 'admin.metrics.matched', value: matched },
        { key: 'admin.metrics.messaged', value: messaged },
      ]);
      setIsLoading(false);
    };

    void load().catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const top = Math.max(...steps.map((s) => s.value), 1);

  /** Índice del paso con la peor conversión respecto al anterior. */
  const mayorCaida = steps.reduce(
    (peor, step, index) => {
      if (index === 0 || steps[index - 1].value === 0) return peor;
      const ratio = step.value / steps[index - 1].value;
      return ratio < peor.ratio ? { index, ratio } : peor;
    },
    { index: -1, ratio: 1 },
  ).index;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.metrics.title')}</CardTitle>
        <CardDescription>{t('admin.metrics.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-party-primary" />
          </div>
        ) : steps.every((s) => s.value === 0) ? (
          <p className="text-muted-foreground text-sm">{t('admin.metrics.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {steps.map((step, index) => {
              const previo = index > 0 ? steps[index - 1].value : null;
              const paso = previo && previo > 0 ? Math.round((step.value / previo) * 100) : null;
              // La mayor caída del embudo se marca: es donde hay que mirar.
              const esCaida = index === mayorCaida;
              return (
                <li key={step.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-body-sm">
                    <span className="font-semibold">{t(step.key)}</span>
                    <span className="shrink-0 font-bold tabular">
                      {step.value}
                      {paso !== null && (
                        <span className={esCaida ? 'ml-2 text-caption text-destructive' : 'ml-2 text-caption font-normal text-muted-foreground'}>
                          {esCaida ? '▼ ' : ''}
                          {paso}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-party-primary"
                      style={{ width: `${Math.round((step.value / top) * 100)}%` }}
                    />
                  </div>
                  {esCaida && (
                    <p className="mt-1 text-caption text-muted-foreground">{t('admin.metrics.biggestDrop')}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminMetrics;
