import { useTranslation } from 'react-i18next';
import { BadgeCheck, BellRing, Heart, MessageCircle, Timer, Zap } from 'lucide-react';

/**
 * «Dos pantallas, un mismo ritmo»: la tarjeta de Vybe Check y el panel del
 * local, dibujados en HTML en vez de capturas. Pesan nada, se traducen solos y
 * no se quedan viejos cuando cambia la app.
 *
 * Las cifras son de ejemplo y la sección lo dice («Vista de ejemplo»): no son
 * datos de ningún local.
 */

/** Entradas por hora de la curva de ejemplo, de 23:00 a 05:00. */
const CURVA = [8, 14, 26, 44, 71, 96, 118, 104, 88, 97, 121, 92, 58];

const Curve = () => {
  const w = 600;
  const h = 150;
  const max = Math.max(...CURVA);
  const puntos = CURVA.map((v, i) => [(i / (CURVA.length - 1)) * w, h - (v / max) * (h - 12)] as const);
  const linea = puntos
    .map(([x, y], i) => {
      if (i === 0) return `M${x},${y}`;
      const [px, py] = puntos[i - 1];
      const cx = (px + x) / 2;
      return `C${cx},${py} ${cx},${y} ${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full lg:h-40" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="landing-curve" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#F8D000" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#F8D000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linea} L${w},${h} L0,${h} Z`} fill="url(#landing-curve)" />
      <path d={linea} fill="none" stroke="#F8D000" strokeWidth="3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const PhoneMock = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[28px] bg-white p-4 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-display text-title-card uppercase">
          <span className="h-2.5 w-2.5 rounded-full bg-party-primary" />
          {t('landing.showcase.phone.title')}
        </span>
        <span className="rounded-full bg-ink px-2.5 py-1 text-caption text-white">{t('landing.showcase.phone.inside')}</span>
      </div>

      <div className="relative mt-3 aspect-[4/5] overflow-hidden rounded-2xl bg-ink">
        <img
          src="/landing/crowd.webp"
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          width={900}
          height={600}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-party-primary px-2.5 py-1 text-label-pill uppercase text-ink">
          {t('landing.showcase.phone.tag')}
        </span>
        <div className="absolute inset-x-3 bottom-3 text-white">
          <p className="flex items-center gap-1.5 font-display text-headline-md">
            {t('landing.showcase.phone.name')}
            <BadgeCheck size={18} className="text-party-primary" />
          </p>
          <p className="text-body-sm text-white/80">{t('landing.showcase.phone.meta')}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <span className="flex h-11 items-center justify-center gap-2 rounded-xl bg-ink text-body-md font-bold text-white">
          <MessageCircle size={16} />
          {t('landing.showcase.phone.hello')}
        </span>
        <span className="flex h-11 items-center justify-center gap-2 rounded-xl bg-party-primary text-body-md font-bold text-ink">
          <Heart size={16} />
          {t('landing.showcase.phone.like')}
        </span>
      </div>

      <p className="mt-2 flex items-center gap-2 rounded-xl bg-black/[0.05] px-3 py-2.5 text-body-sm font-bold">
        <Timer size={16} />
        {t('landing.showcase.phone.expires')}
      </p>
    </div>
  );
};

export const PanelMock = () => {
  const { t } = useTranslation();

  const stats = [
    { label: t('landing.showcase.panel.capacity'), value: '1.240', help: t('landing.showcase.panel.capacityOf', { max: '1.500' }), tone: 'text-party-primary' },
    { label: t('landing.showcase.panel.lastHour'), value: '312', help: '+18%', tone: 'text-[#3FE6FF]' },
    { label: t('landing.showcase.panel.promoters'), value: '41%', help: '6 RRPP', tone: 'text-foreground' },
    { label: t('landing.showcase.panel.redeemed'), value: '186', help: '2x1', tone: 'text-foreground' },
  ];

  return (
    <div className="w-full rounded-2xl bg-surface-low p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide lg:text-headline-md">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-party-primary" />
            {t('landing.showcase.panel.title')}
          </p>
          <p className="mt-0.5 text-body-sm text-party-gray">{t('landing.showcase.panel.subtitle')}</p>
        </div>
        <span className="rounded-full bg-surface-high px-2.5 py-1 text-caption text-party-primary">
          {t('landing.showcase.panel.live')}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-surface-container p-3">
            <p className="text-caption text-party-gray">{s.label}</p>
            <p className={`mt-1 font-display text-headline-lg ${s.tone}`}>{s.value}</p>
            <p className="text-caption text-party-gray">{s.help}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 rounded-xl bg-surface-container p-3 lg:p-4">
        <div className="flex items-center justify-between">
          <p className="text-caption uppercase tracking-wide text-party-gray">{t('landing.showcase.panel.curve')}</p>
          <p className="text-caption text-party-primary">{t('landing.showcase.panel.peak', { time: '03:30' })}</p>
        </div>
        <Curve />
        <div className="flex justify-between text-caption text-party-gray">
          <span>23:00</span>
          <span>01:00</span>
          <span>03:00</span>
          <span>05:00</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container px-3 py-3">
        <p className="flex items-center gap-2 text-body-sm">
          <BellRing size={16} className="shrink-0 text-party-primary" />
          {t('landing.showcase.panel.promo')}
        </p>
        <p className="flex items-center gap-1 text-caption text-[#3FE6FF]">
          <Zap size={13} />
          {t('landing.showcase.panel.promoCount', { count: 186 })}
        </p>
      </div>
    </div>
  );
};
