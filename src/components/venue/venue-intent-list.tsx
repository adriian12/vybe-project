import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ListChecks, Ticket, User } from 'lucide-react';
import { IntentPerson, nightService } from '@/services/night';
import { cn } from '@/lib/utils';

/**
 * Lista Vybe: quién ha marcado «voy a ir». Es la previsión de gente de una
 * fiesta gratuita, donde no hay venta de entradas que mirar. Con entradas se
 * dice que la previsión son las ventas y se enseña sólo el recuento.
 *
 * Nombre de pila, edad y foto: lo justo para reconocer a la gente en la puerta.
 * La app avisa al marcar «voy a ir» de que el local lo verá.
 */
const VenueIntentList = ({ eventId, paid }: { eventId: string; paid: boolean }) => {
  const { t } = useTranslation();
  const [people, setPeople] = useState<IntentPerson[]>([]);
  const [verTodos, setVerTodos] = useState(false);

  const load = useCallback(async () => {
    setPeople(await nightService.getIntentList(eventId));
  }, [eventId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const resumen = useMemo(() => {
    const llegados = people.filter((p) => p.arrived).length;
    const mujeres = people.filter((p) => p.gender === 'woman').length;
    const hombres = people.filter((p) => p.gender === 'man').length;
    return { llegados, mujeres, hombres };
  }, [people]);

  const lista = verTodos ? people : people.slice(0, 12);

  return (
    <div className="surface-light rounded-2xl p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <ListChecks size={17} className="text-party-primary" />
          {t('venue.intentList.title')}
        </h3>
        <span className="font-display text-headline-md tabular">{people.length}</span>
      </div>

      {paid ? (
        <p className="flex items-start gap-2 text-body-sm text-party-gray">
          <Ticket size={15} className="mt-0.5 shrink-0" />
          {t('venue.intentList.paid', { count: people.length })}
        </p>
      ) : people.length === 0 ? (
        <p className="text-body-sm text-party-gray">{t('venue.intentList.empty')}</p>
      ) : (
        <>
          <p className="mb-3 text-caption text-party-gray">
            {t('venue.intentList.summary', {
              arrived: resumen.llegados,
              women: resumen.mujeres,
              men: resumen.hombres,
            })}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {lista.map((person) => (
              <li
                key={person.profileId}
                className={cn('flex items-center gap-2.5 rounded-xl p-2', person.arrived ? 'bg-emerald-500/10' : 'bg-black/[0.03]')}
              >
                {person.avatar ? (
                  <img src={person.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/10">
                    <User size={16} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-bold">
                    {person.firstName}
                    {person.age ? `, ${person.age}` : ''}
                  </span>
                  <span className="block truncate text-caption text-party-gray">
                    {person.arrived ? t('venue.intentList.arrived') : t('venue.intentList.pending')}
                  </span>
                </span>
                {person.arrived && <CheckCircle2 size={17} className="shrink-0 text-emerald-600" />}
              </li>
            ))}
          </ul>
          {people.length > 12 && (
            <button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              className="press mt-3 w-full text-center text-caption font-bold underline underline-offset-2"
            >
              {verTodos ? t('venue.intentList.showLess') : t('venue.intentList.showAll', { count: people.length })}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default VenueIntentList;
