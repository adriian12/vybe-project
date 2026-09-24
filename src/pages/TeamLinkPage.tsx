import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, LinkIcon, RefreshCw } from 'lucide-react';
import LanguageSwitcher from '@/components/language-switcher';
import { VybeMark } from '@/components/brand/vybe-logo';
import TeamSecurity from '@/components/team/team-security';
import TeamWaiter from '@/components/team/team-waiter';
import TeamPromoter from '@/components/team/team-promoter';
import { teamLink, TeamLinkError, TeamLinkState } from '@/services/team';

/**
 * El enlace de alguien del equipo: `/equipo/<token>` (migración 072).
 *
 * Sin cuenta, en cualquier móvil. Lo crea el propietario en Equipo:
 *   · Seguridad (una noche): aforo, puerta, listas, entradas, alertas y denuncias.
 *   · Camareros (una noche): vales, ofertas, sorteos y alertas.
 *   · RRPP (fijo): su lista, su código y su comisión en cada fiesta.
 */
const TeamLinkPage = () => {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const client = useMemo(() => teamLink(token), [token]);

  const [state, setState] = useState<TeamLinkState | null>(null);
  const [error, setError] = useState<'invalid' | 'network' | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setState(await client.state());
    } catch (e) {
      setError(e instanceof TeamLinkError ? 'invalid' : 'network');
    }
  }, [client]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Si el enlace caduca o lo revocan con la página abierta. */
  const caducado = useCallback(() => setError('invalid'), []);

  const subtitulo = state?.event ? state.event.name : state?.venueName;

  return (
    <div className="pt-safe pb-safe flex min-h-[100dvh] flex-col bg-background px-margin">
      <header className="flex items-center justify-between gap-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <VybeMark size={36} />
          <div className="min-w-0">
            <p className="text-label-pill uppercase tracking-wider text-party-primary">
              {state ? `${t(`venue.team.roles.${state.role}`)} · ${state.label}` : t('team.link.loading')}
            </p>
            <p className="truncate font-display text-title-card">
              {subtitulo ?? '…'}
              {state?.event ? <span className="font-normal text-party-gray"> · {state.venueName}</span> : null}
            </p>
          </div>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-4">
        {error === 'invalid' ? (
          <div className="enter flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-high text-party-primary">
              <LinkIcon size={28} />
            </span>
            <h1 className="mt-5 font-display text-headline-lg">{t('team.link.invalid')}</h1>
            <p className="mt-2 text-body-md text-party-gray">{t('counter.askVenue')}</p>
          </div>
        ) : error === 'network' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-body-md text-party-gray">{t('team.link.error')}</p>
            <button
              type="button"
              onClick={() => void cargar()}
              className="press flex h-11 items-center gap-2 rounded-xl bg-party-primary px-5 font-bold text-ink"
            >
              <RefreshCw size={16} />
              {t('team.link.retry')}
            </button>
          </div>
        ) : !state ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
          </div>
        ) : state.role === 'security' ? (
          <TeamSecurity client={client} state={state} onInvalid={caducado} />
        ) : state.role === 'waiter' ? (
          <TeamWaiter client={client} state={state} />
        ) : (
          <TeamPromoter client={client} state={state} />
        )}
      </main>
    </div>
  );
};

export default TeamLinkPage;
