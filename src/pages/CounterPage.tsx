import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DoorOpen, LinkIcon } from 'lucide-react';
import DoorCounter from '@/components/venue/door-counter';
import LanguageSwitcher from '@/components/language-switcher';
import { VybeMark } from '@/components/brand/vybe-logo';
import { CounterState, linkTransport } from '@/services/door-counter';

/**
 * Contador del portero: `/contador/<token>`.
 *
 * El local crea el enlace en su panel (Puerta) y se lo pasa al portero, que no
 * necesita cuenta. Funciona en cualquier móvil y en `app.vybes.es`. El total que
 * cuenta sólo lo ven el local y quien tiene el enlace; el público ve el ambiente.
 */
const CounterPage = () => {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const transport = useMemo(() => linkTransport(token), [token]);

  const [info, setInfo] = useState<CounterState | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const cerrado = fatal === 'INVALID_LINK' || fatal === 'EVENT_NOT_LIVE';

  return (
    <div className="pt-safe pb-safe flex min-h-[100dvh] flex-col bg-background px-margin">
      <header className="flex items-center justify-between gap-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <VybeMark size={36} />
          <div className="min-w-0">
            <p className="text-label-pill uppercase tracking-wider text-party-primary">{t('counter.title')}</p>
            <p className="truncate font-display text-title-card">
              {info?.eventName ?? '…'}
              {info?.venueName ? <span className="font-normal text-party-gray"> · {info.venueName}</span> : null}
            </p>
          </div>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col py-4">
        {cerrado ? (
          <div className="enter flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-high text-party-primary">
              {fatal === 'INVALID_LINK' ? <LinkIcon size={28} /> : <DoorOpen size={28} />}
            </span>
            <h1 className="mt-5 font-display text-headline-lg">{t(`counter.errors.${fatal}`)}</h1>
            <p className="mt-2 text-body-md text-party-gray">{t('counter.askVenue')}</p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-center text-body-sm text-party-gray">{t('counter.hint')}</p>
            <DoorCounter transport={transport} variant="full" onState={setInfo} onFatal={setFatal} />
          </>
        )}
      </main>
    </div>
  );
};

export default CounterPage;
