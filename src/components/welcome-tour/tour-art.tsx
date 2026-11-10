import { useTranslation } from 'react-i18next';
import { ChevronRight, Heart, House, LifeBuoy, MapPin, Ban, Flag, Share2, ShieldCheck, Sparkles, X } from 'lucide-react';
import { VybeMark } from '@/components/brand/vybe-logo';
import { CabifyLogo, UberLogo } from '@/components/go-home/ride-logos';
import { cn } from '@/lib/utils';

/**
 * Las ilustraciones del tutorial. Todo es dibujo propio (SVG y cajas): ni fotos
 * ni caras de nadie, también en el tablón, donde las «personas» son siluetas.
 */

/** La tarjeta redondeada donde va cada dibujo. */
export const ArtCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div
    aria-hidden
    className={cn(
      'relative mx-auto aspect-[10/9] max-h-[42dvh] w-full overflow-hidden rounded-[28px] bg-surface-low shadow-[0_20px_50px_rgba(0,0,0,0.45)]',
      className,
    )}
  >
    {/* La luz amarilla de la marca, de esquina a esquina. */}
    <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-party-primary/[0.10] blur-3xl" />
    <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-party-accent/[0.08] blur-3xl" />
    {children}
  </div>
);

/** Un marcador redondo, como los del mapa de la app. */
const Pin: React.FC<{ emoji: string; className?: string; tone?: 'yellow' | 'dark' }> = ({
  emoji,
  className,
  tone = 'yellow',
}) => (
  <span
    className={cn(
      'absolute flex h-11 w-11 items-center justify-center rounded-full text-[20px] shadow-[0_6px_16px_rgba(0,0,0,0.5)] ring-[3px]',
      tone === 'yellow' ? 'bg-party-primary ring-ink' : 'bg-surface-highest ring-party-primary',
      className,
    )}
  >
    {emoji}
  </span>
);

export const IntroArt = () => (
  <ArtCard>
    <div className="absolute -left-10 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-surface-container" />
    <div className="absolute -right-12 -top-10 h-56 w-56 rounded-full bg-surface-high/60" />
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="flex h-36 w-36 items-center justify-center rounded-full bg-ink ring-4 ring-party-primary/80 shadow-[0_0_0_10px_rgba(248,208,0,0.12),0_20px_40px_rgba(0,0,0,0.6)]">
        <VybeMark size={84} />
      </span>
    </div>
    <Pin emoji="🎧" className="left-[16%] top-[16%]" />
    <Pin emoji="🎟️" className="right-[14%] top-[22%]" tone="dark" />
    <Pin emoji="🍸" className="bottom-[16%] left-[22%]" tone="dark" />
    <Pin emoji="💛" className="bottom-[20%] right-[18%]" />
  </ArtCard>
);

export const DiscoverArt = () => {
  const { t } = useTranslation();
  return (
    <ArtCard className="bg-[#18181B]">
      {/* Calles de un mapa oscuro, como las teselas del mapa de la app. */}
      <svg viewBox="0 0 300 270" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <rect width="300" height="270" fill="#18181B" />
        <rect x="190" y="0" width="110" height="80" rx="14" fill="#1E2A22" />
        <rect x="0" y="190" width="90" height="80" rx="14" fill="#1E2A22" />
        <g stroke="#2E2E33" strokeWidth="16" strokeLinecap="round">
          <path d="M-10 100 H310" />
          <path d="M-10 180 H310" />
          <path d="M70 -10 V280" />
          <path d="M180 -10 V280" />
        </g>
        <path d="M-10 250 Q150 140 310 40" stroke="#3A3A40" strokeWidth="9" fill="none" />
      </svg>
      <div className="absolute inset-x-3 top-3 flex gap-1.5">
        {[t('tour.art.today'), t('tour.art.techno'), t('tour.art.flechazo')].map((chip, i) => (
          <span
            key={chip}
            className={cn(
              'rounded-full px-3 py-1.5 text-[12px] font-bold shadow',
              i === 0 ? 'bg-party-primary text-ink' : 'bg-surface-highest text-foreground',
            )}
          >
            {chip}
          </span>
        ))}
      </div>
      <Pin emoji="🎧" className="left-[17%] top-[30%]" />
      <Pin emoji="🍸" className="right-[20%] top-[45%]" />
      <Pin emoji="🎤" className="bottom-[14%] left-[46%]" tone="dark" />
      <Pin emoji="🪩" className="right-[10%] top-[20%]" tone="dark" />
      {/* Tú. */}
      <span className="absolute left-[44%] top-[52%] h-4 w-4 rounded-full bg-sky-400 ring-4 ring-sky-400/25" />
    </ArtCard>
  );
};

/** Un QR de mentira, dibujado, para el pase y el código del local. */
const FakeQr: React.FC<{ className?: string }> = ({ className }) => {
  const celdas: [number, number][] = [];
  // Un patrón fijo: el mismo dibujo siempre, sin azar en cada render.
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x < 13; x++) {
      const esquina = (x < 4 && y < 4) || (x > 8 && y < 4) || (x < 4 && y > 8);
      const ruido = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      if (!esquina && ruido - Math.floor(ruido) > 0.48) celdas.push([x, y]);
    }
  }
  const marco = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="4" height="4" rx="0.8" fill="none" stroke="#111114" strokeWidth="0.9" />
      <rect x={x + 1.2} y={y + 1.2} width="1.6" height="1.6" rx="0.3" fill="#111114" />
    </g>
  );
  return (
    <svg viewBox="-0.5 -0.5 14 14" className={className}>
      {celdas.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width="0.92" height="0.92" rx="0.2" fill="#111114" />
      ))}
      {marco(0, 0)}
      {marco(9, 0)}
      {marco(0, 9)}
    </svg>
  );
};

export const TicketsArt = () => {
  const { t } = useTranslation();
  return (
    <ArtCard>
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="relative w-[78%] max-w-[260px] -rotate-3 rounded-[22px] bg-white text-ink shadow-[0_24px_50px_rgba(0,0,0,0.55)]">
          <div className="flex items-center gap-2 px-4 pb-3 pt-4">
            <VybeMark size={22} />
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink/60">
              {t('tour.art.ticket')}
            </span>
          </div>
          <p className="px-4 font-display text-[19px] font-extrabold leading-tight">{t('tour.art.ticketEvent')}</p>
          <p className="px-4 text-[12px] font-semibold text-ink/60">{t('tour.art.ticketWhen')}</p>
          {/* El corte del pase. */}
          <div className="relative my-3 border-t-2 border-dashed border-ink/15">
            <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-surface-low" />
            <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-surface-low" />
          </div>
          <div className="flex justify-center px-4 pb-4">
            <FakeQr className="h-28 w-28" />
          </div>
        </div>
      </div>
    </ArtCard>
  );
};

export const EnterArt = () => {
  const { t } = useTranslation();
  return (
    <ArtCard>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-5">
        {/* El visor de la cámara sobre el QR del local. */}
        <div className="relative flex h-32 w-32 items-center justify-center rounded-2xl bg-white/95">
          <FakeQr className="h-24 w-24" />
          {['left-0 top-0 border-l-4 border-t-4', 'right-0 top-0 border-r-4 border-t-4', 'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4'].map((c) => (
            <span key={c} className={cn('absolute -m-2 h-7 w-7 rounded-md border-party-primary', c)} />
          ))}
          <span className="tour-scan absolute inset-x-1 top-1/2 h-[3px] rounded-full bg-party-primary shadow-[0_0_12px_rgba(248,208,0,0.9)]" />
        </div>
        <div className="flex items-center gap-2">
          {['F', 'I', 'E', '7'].map((c) => (
            <span
              key={c}
              className="flex h-10 w-9 items-center justify-center rounded-lg bg-surface-highest font-display text-[18px] font-extrabold"
            >
              {c}
            </span>
          ))}
          <span className="ml-1 flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
            <MapPin size={12} /> {t('tour.art.here')}
          </span>
        </div>
        {/* La tarjeta de Inicio mientras estás dentro. */}
        <span className="flex w-full max-w-[250px] items-center justify-between gap-2 rounded-2xl bg-party-primary px-3.5 py-2.5 text-ink shadow-[0_8px_20px_rgba(248,208,0,0.25)]">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.1em]">
              <span className="h-1.5 w-1.5 rounded-full bg-ink" />
              {t('home.youAreIn')}
            </span>
            <span className="block truncate font-display text-[15px] font-black">{t('tour.art.ticketEvent')}</span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5 rounded-lg bg-ink px-2 py-1 text-[11px] font-bold text-party-primary">
            {t('home.goBack')}
            <ChevronRight size={12} />
          </span>
        </span>
      </div>
    </ArtCard>
  );
};

/** Una persona del tablón, sin cara: una silueta sobre un degradado. */
const Silueta: React.FC<{ from: string; to: string; className?: string; children?: React.ReactNode }> = ({
  from,
  to,
  className,
  children,
}) => (
  <div
    className={cn('absolute overflow-hidden rounded-[22px] shadow-[0_16px_36px_rgba(0,0,0,0.55)]', className)}
    style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
  >
    <svg viewBox="0 0 100 130" className="absolute inset-x-0 bottom-0 w-full opacity-40">
      <circle cx="50" cy="52" r="22" fill="#111114" />
      <path d="M8 130 C12 92 30 80 50 80 C70 80 88 92 92 130 Z" fill="#111114" />
    </svg>
    {children}
  </div>
);

export const SwipeArt = () => {
  const { t } = useTranslation();
  return (
    <ArtCard>
      <Silueta from="#7C3AED" to="#DB2777" className="left-[14%] top-[12%] h-[66%] w-[46%] -rotate-[10deg] opacity-80" />
      <Silueta from="#F8D000" to="#FF7A00" className="left-[30%] top-[8%] h-[70%] w-[48%] rotate-[6deg]">
        <span className="absolute left-3 top-3 rounded-lg border-[3px] border-emerald-400 px-2 py-0.5 font-display text-[15px] font-extrabold uppercase text-emerald-400 [transform:rotate(-12deg)]">
          {t('tour.art.like')}
        </span>
        <span className="absolute bottom-3 left-3 font-display text-[15px] font-extrabold text-ink">
          {t('tour.art.swipeName')}
        </span>
      </Silueta>
      <div className="absolute inset-x-0 bottom-[6%] flex items-center justify-center gap-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-highest text-foreground shadow-lg">
          <X size={24} strokeWidth={3} />
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 font-display text-[15px] font-extrabold text-ink shadow-lg">
          <Sparkles size={16} className="text-party-accent" /> {t('tour.art.match')}
        </span>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-party-primary text-ink shadow-lg">
          <Heart size={22} fill="currentColor" />
        </span>
      </div>
    </ArtCard>
  );
};

/** Un aviso como los que llegan al móvil. */
const Aviso: React.FC<{ title: string; body?: string; action?: string; className?: string }> = ({
  title,
  body,
  action,
  className,
}) => {
  const { t } = useTranslation();
  return (
  <div className={cn('rounded-[18px] bg-white px-3.5 py-2.5 text-ink shadow-[0_12px_28px_rgba(0,0,0,0.45)]', className)}>
    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink/55">
      <VybeMark size={16} /> Fiestea · <span className="normal-case tracking-normal">{t('tour.art.now')}</span>
    </div>
    <p className="font-display text-[14px] font-extrabold leading-tight">{title}</p>
    {body && <p className="text-[12px] leading-snug text-ink/65">{body}</p>}
    {action && (
      <span className="mt-1.5 inline-block rounded-full border-2 border-ink px-3 py-0.5 text-[12px] font-bold">{action}</span>
    )}
  </div>
  );
};

export const VenueArt = () => {
  const { t } = useTranslation();
  return (
    <ArtCard>
      <div className="absolute inset-0 flex flex-col justify-center gap-2 px-4">
        <Aviso title={t('tour.art.offerTitle')} body={t('tour.art.offerBody')} />
        <Aviso title={t('tour.art.raffleTitle')} body={t('tour.art.raffleBody')} action={t('tour.art.raffleAction')} />
        <Aviso title={t('tour.art.noticeTitle')} className="opacity-70" />
      </div>
    </ArtCard>
  );
};

/** «Volver a casa»: Uber y Cabify con tu casa de destino y el precio aproximado. */
export const GoHomeArt = () => {
  const { t } = useTranslation();
  const fila = (logo: React.ReactNode, nombre: string, precio: string, minutos: string) => (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-highest/80 p-2.5">
      {logo}
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15px] font-extrabold leading-tight text-foreground">{nombre}</span>
        <span className="block text-[12px] text-party-gray">
          {precio} · {minutos}
        </span>
      </span>
      <span className="flex h-8 items-center rounded-full bg-party-primary px-3 text-[12px] font-bold text-ink">
        {t('tour.art.rideOpen')}
      </span>
    </div>
  );
  return (
    <ArtCard>
      <div className="absolute inset-0 flex flex-col justify-center gap-2.5 px-4">
        <div className="flex items-center gap-2 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-party-primary text-ink">
            <House size={18} strokeWidth={2.4} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[16px] font-extrabold leading-tight text-foreground">{t('goHome.title')}</span>
            <span className="block truncate text-[12px] text-party-gray">{t('tour.art.rideTo')}</span>
          </span>
        </div>
        {fila(<UberLogo />, 'Uber', '14–18 €', t('tour.art.rideMinutes', { count: 16 }))}
        {fila(<CabifyLogo />, 'Cabify', '15–19 €', t('tour.art.rideMinutes', { count: 16 }))}
        <div className="flex items-center justify-center gap-1.5 rounded-full border border-white/15 py-2 text-[12px] font-bold text-foreground">
          <Share2 size={13} /> {t('goHome.tellSomeone')}
        </div>
      </div>
    </ArtCard>
  );
};

export const SafetyArt = () => {
  const { t } = useTranslation();
  const chip = 'absolute flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold shadow-lg';
  return (
    <ArtCard>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-32 w-32 items-center justify-center rounded-full bg-party-primary text-ink shadow-[0_0_0_12px_rgba(248,208,0,0.12)]">
          <ShieldCheck size={64} strokeWidth={2.2} />
        </span>
      </div>
      <span className={cn(chip, 'left-[8%] top-[12%] bg-white font-display text-[16px] font-extrabold text-ink')}>+18</span>
      <span className={cn(chip, 'right-[7%] top-[18%] bg-surface-highest text-foreground')}>
        <Ban size={14} /> {t('tour.art.block')}
      </span>
      <span className={cn(chip, 'bottom-[22%] left-[6%] bg-surface-highest text-foreground')}>
        <Flag size={14} /> {t('tour.art.report')}
      </span>
      <span className={cn(chip, 'bottom-[14%] right-[6%] bg-red-500 text-white')}>
        <LifeBuoy size={14} /> {t('tour.art.help')}
      </span>
      <span className={cn(chip, 'left-1/2 top-[4%] -translate-x-1/2 border border-party-primary/50 bg-ink text-party-primary')}>
        <Sparkles size={13} /> {t('tour.art.premium')}
      </span>
    </ArtCard>
  );
};
