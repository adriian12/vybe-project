import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SosSource, useVenueSos } from '@/hooks/use-venue-sos';
import type { TeamLinkClient } from '@/services/team';
import { cn } from '@/lib/utils';

/**
 * Las alertas de ayuda de la noche para un enlace sin cuenta: sin Realtime
 * (no hay sesión), se consultan cada diez segundos.
 */
export const useTeamSos = (client: TeamLinkClient, eventId: string | null | undefined) => {
  const source = useMemo<SosSource>(
    () => ({
      load: client.sos,
      acknowledge: client.acknowledge,
      resolve: client.resolve,
      realtime: false,
      intervalMs: 10_000,
    }),
    [client],
  );
  return useVenueSos(eventId, source);
};

export interface TeamTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Un número rojo: alertas abiertas. */
  badge?: number;
}

/** Pestañas grandes, para usarlas con una mano en la puerta o en la barra. */
export const TeamTabs = <T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: TeamTab<T>[];
  value: T;
  onChange: (id: T) => void;
}) => (
  <nav className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
    {tabs.map(({ id, label, icon: Icon, badge }) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        className={cn(
          'press relative flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-label-pill font-bold uppercase',
          value === id ? 'bg-party-primary text-ink' : 'bg-surface-high text-foreground/80',
        )}
      >
        <Icon size={15} />
        {label}
        {badge ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] text-white">
            {badge}
          </span>
        ) : null}
      </button>
    ))}
  </nav>
);
