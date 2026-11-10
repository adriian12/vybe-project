import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Building2,
  CalendarPlus,
  Crown,
  DoorOpen,
  Gift,
  Megaphone,
  QrCode,
  ScanLine,
  Siren,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import WelcomeTour, { type TourStep } from '@/components/welcome-tour/welcome-tour';
import { ArtCard } from '@/components/welcome-tour/tour-art';
import { VybeMark } from '@/components/brand/vybe-logo';
import { cn } from '@/lib/utils';

/**
 * Dibujo de un paso del tutorial del panel: el icono grande de la sección en
 * el centro y, alrededor, las cosas que se hacen en ella.
 */
const Seccion: React.FC<{
  Icon: React.FC<{ size?: number; strokeWidth?: number }>;
  chips: { Icon: React.FC<{ size?: number }>; texto: string }[];
}> = ({ Icon, chips }) => {
  const sitios = ['left-[6%] top-[12%]', 'right-[6%] top-[22%]', 'bottom-[22%] left-[6%]', 'bottom-[10%] right-[8%]'];
  return (
    <ArtCard>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-32 w-32 items-center justify-center rounded-[32px] bg-party-primary text-ink shadow-[0_0_0_12px_rgba(248,208,0,0.12),0_20px_40px_rgba(0,0,0,0.5)]">
          <Icon size={60} strokeWidth={2.2} />
        </span>
      </div>
      {chips.map(({ Icon: Chip, texto }, i) => (
        <span
          key={texto}
          className={cn(
            'absolute flex max-w-[46%] items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold shadow-lg',
            i === 0 ? 'bg-white text-ink' : 'bg-surface-highest text-foreground',
            sitios[i],
          )}
        >
          <Chip size={14} />
          <span className="truncate">{texto}</span>
        </span>
      ))}
    </ArtCard>
  );
};

/** Un dibujo por paso, con los textos de `venueTour.art`. */
const arte = (Icon: React.FC<{ size?: number; strokeWidth?: number }>, chips: [React.FC<{ size?: number }>, string][]) => {
  const Art: React.FC = () => {
    const { t } = useTranslation();
    return <Seccion Icon={Icon} chips={chips.map(([I, clave]) => ({ Icon: I, texto: t(`venueTour.art.${clave}`) }))} />;
  };
  return Art;
};

const IntroArt: React.FC = () => (
  <ArtCard>
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="flex h-36 w-36 items-center justify-center rounded-full bg-ink ring-4 ring-party-primary/80 shadow-[0_0_0_10px_rgba(248,208,0,0.12),0_20px_40px_rgba(0,0,0,0.6)]">
        <VybeMark size={84} />
      </span>
    </div>
    {[
      [CalendarPlus, 'left-[14%] top-[16%]'],
      [Ticket, 'right-[14%] top-[20%]'],
      [Megaphone, 'bottom-[16%] left-[20%]'],
      [BarChart3, 'bottom-[18%] right-[16%]'],
    ].map(([I, sitio], i) => {
      const Icono = I as React.FC<{ size?: number }>;
      return (
        <span
          key={i}
          className={cn(
            'absolute flex h-11 w-11 items-center justify-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,0.5)] ring-[3px]',
            i % 2 ? 'bg-surface-highest text-party-primary ring-party-primary' : 'bg-party-primary text-ink ring-ink',
            sitio as string,
          )}
        >
          <Icono size={20} />
        </span>
      );
    })}
  </ArtCard>
);

/**
 * Los pasos del tutorial del panel, en el orden en que se usa el panel: crear
 * la fiesta, la puerta, vender, avisar, medir, la ficha y el equipo, el plan.
 * Los textos están en `venueTour.steps.<id>`. Si cambia una sección del panel,
 * cambia su paso.
 */
const PASOS_NEGOCIO: readonly TourStep[] = [
  { id: 'intro', Art: IntroArt },
  { id: 'events', Art: arte(CalendarPlus, [[CalendarPlus, 'newEvent'], [Sparkles, 'boost'], [Users, 'followers'], [Ticket, 'lineup']]) },
  { id: 'door', Art: arte(DoorOpen, [[QrCode, 'qr'], [ScanLine, 'scan'], [Users, 'capacity'], [Siren, 'sos']]) },
  { id: 'sales', Art: arte(Wallet, [[Wallet, 'stripe'], [Ticket, 'ticketTypes'], [Users, 'lists'], [TrendingUp, 'payouts']]) },
  { id: 'broadcast', Art: arte(Megaphone, [[Megaphone, 'notice'], [Gift, 'promos'], [Users, 'audiences'], [Sparkles, 'brandedPush']]) },
  { id: 'stats', Art: arte(BarChart3, [[TrendingUp, 'forecast'], [BarChart3, 'nightly'], [Users, 'demographics'], [Megaphone, 'weekly']]) },
  { id: 'business', Art: arte(Building2, [[Building2, 'profile'], [Users, 'team'], [Ticket, 'promoters'], [Sparkles, 'socials']]) },
  { id: 'plan', Art: arte(Crown, [[Crown, 'business'], [Sparkles, 'boostIncluded'], [Megaphone, 'audiencesPlan'], [BarChart3, 'exports']]) },
];

/** El tutorial del panel de negocio: el mismo formato que el de bienvenida. */
const VenueTour: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <WelcomeTour onClose={onClose} loggedIn steps={PASOS_NEGOCIO} textos="venueTour" />
);

export default VenueTour;
