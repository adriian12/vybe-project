import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, Loader2, Siren, Ticket, Trophy } from 'lucide-react';
import { CodeCheck, CodeValidator } from '@/components/venue/ticket-validator';
import VenueSosAlerts from '@/components/venue/venue-sos-alerts';
import VenueSosAlarm from '@/components/venue/venue-sos-alarm';
import { TeamTab, TeamTabs, useTeamSos } from '@/components/team/team-bits';
import { TeamLinkClient, TeamLinkState, TeamOffer, TeamRaffle } from '@/services/team';

type Tab = 'vouchers' | 'offers' | 'alerts';

const hora = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Camareros con su enlace de la noche: validar vales, promociones y premios de
 * sorteo en la barra, ver las ofertas activas y recibir las alertas de ayuda.
 */
const TeamWaiter = ({ client, state }: { client: TeamLinkClient; state: TeamLinkState }) => {
  const { t } = useTranslation();
  const sos = useTeamSos(client, state.event?.id);
  const [tab, setTab] = useState<Tab>('vouchers');
  const [datos, setDatos] = useState<{ offers: TeamOffer[]; raffles: TeamRaffle[] } | null>(null);

  const validar = useCallback(
    async (code: string): Promise<CodeCheck> => {
      const r = await client.call<{ title: string; holder_name: string; already_used: boolean }>('voucher', { code });
      return {
        alreadyUsed: r.already_used,
        headline: t(r.already_used ? 'team.waiter.used' : 'team.waiter.ok'),
        detail: `${r.title} · ${r.holder_name}`,
      };
    },
    [client, t],
  );

  const cargar = useCallback(async () => {
    try {
      setDatos(await client.call<{ offers: TeamOffer[]; raffles: TeamRaffle[] }>('offers'));
    } catch {
      // Se reintenta en la siguiente vuelta.
    }
  }, [client]);

  useEffect(() => {
    void cargar();
    const interval = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(interval);
  }, [cargar]);

  const abiertas = sos.alerts.filter((a) => !a.handledAt).length;
  const tabs: TeamTab<Tab>[] = [
    { id: 'vouchers', label: t('team.tabs.vouchers'), icon: Ticket },
    { id: 'offers', label: t('team.tabs.offers'), icon: Gift },
    { id: 'alerts', label: t('team.tabs.alerts'), icon: Siren, badge: abiertas },
  ];

  return (
    <>
      <VenueSosAlarm sos={sos} onOpenDoor={() => setTab('alerts')} />
      <TeamTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as Tab)} />

      {tab === 'vouchers' && (
        <div className="space-y-3">
          <CodeValidator
            title={t('team.waiter.validateTitle')}
            placeholder="XXXXXXXX"
            minLength={6}
            maxLength={12}
            check={validar}
          />
          <p className="px-1 text-caption text-party-gray">{t('team.waiter.validateHelp')}</p>
        </div>
      )}

      {tab === 'offers' && (
        <div className="space-y-4">
          <section className="surface-light rounded-2xl p-4">
            <h3 className="mb-3 flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
              <Gift size={17} />
              {t('team.waiter.offersTitle')}
            </h3>
            {!datos ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
              </div>
            ) : datos.offers.length === 0 ? (
              <p className="py-2 text-center text-body-sm text-party-gray">{t('team.waiter.noOffers')}</p>
            ) : (
              <ul className="divide-y divide-black/[0.06]">
                {datos.offers.map((o) => (
                  <li key={o.id} className="py-3">
                    <p className="text-body-md font-bold">{o.title}</p>
                    {o.description && <p className="text-body-sm text-party-gray">{o.description}</p>}
                    <p className="mt-1 text-caption text-party-gray">
                      {t('team.waiter.validatedOf', { validated: o.validated, claimed: o.claimed })}
                      {o.endsAt ? ` · ${t('team.waiter.until', { time: hora(o.endsAt) })}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {datos && datos.raffles.length > 0 && (
            <section className="surface-light rounded-2xl p-4">
              <h3 className="mb-3 flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
                <Trophy size={17} />
                {t('team.waiter.rafflesTitle')}
              </h3>
              <ul className="divide-y divide-black/[0.06]">
                {datos.raffles.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-body-md font-bold">{r.prize}</p>
                      <p className="text-caption text-party-gray">
                        {r.winnerName
                          ? t('team.waiter.winner', { name: r.winnerName })
                          : t('team.waiter.drawAt', { time: hora(r.drawAt) })}
                      </p>
                    </div>
                    {r.winnerCode && (
                      <span className="shrink-0 rounded-lg bg-party-primary px-2.5 py-1 font-mono text-caption font-extrabold text-ink">
                        {r.winnerCode}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === 'alerts' && <VenueSosAlerts sos={sos} />}
    </>
  );
};

export default TeamWaiter;
