import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  Clock3,
  Map as MapIcon,
  Menu,
  MessageCircleHeart,
  QrCode,
  ScanLine,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Ticket,
  TrendingUp,
  UserRoundCheck,
  Users,
  X,
  Zap,
  LockKeyhole,
  MapPinned,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import LanguageSwitcher from '@/components/language-switcher';
import { VybeMark } from '@/components/brand/vybe-logo';
import Reveal from '@/components/landing/reveal';
import VenueLeadForm from '@/components/landing/venue-lead-form';
import { PanelMock, PhoneMock } from '@/components/landing/landing-showcase';
import { useAppContext } from '@/context/app-context';
import { COMPANY } from '@/lib/company';
import { cn } from '@/lib/utils';
import { PLAN_FEATURES, PLANS, PlanId } from '@/lib/venue-plans';

/**
 * Landing pública de Vybe, según «Landing Page Oficial Vybes» de Stitch
 * (escritorio y móvil en `diseños/stitch/50-landing-d` y `51-landing-m`).
 *
 * Se ve en `/` desde el navegador. Dentro de la app instalada (Capacitor o la
 * web añadida a la pantalla de inicio) `/` sigue siendo la bienvenida: quien ya
 * tiene la app no necesita que se la vendan.
 *
 * Del diseño se toma la composición, no el texto: el de Stitch prometía cosas
 * que Vybe no hace (balizas BLE, cifrado de extremo a extremo, biometría) y
 * cifras y testimonios inventados. Aquí todo lo que se afirma es verdad hoy.
 */

const USER_SIGNUP = '/auth?type=user&mode=register';
const VENUE_SIGNUP = '/auth?type=venue&mode=register';

const SectionHeading = ({
  eyebrow,
  title,
  body,
  center = false,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  center?: boolean;
}) => (
  <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
    <p className="text-label-pill uppercase tracking-[0.12em] text-party-primary">{eyebrow}</p>
    <h2 className="mt-2 font-display text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-[36px] lg:text-[44px]">
      {title}
    </h2>
    {body && <p className="mt-3 text-[15px] leading-relaxed text-party-gray lg:text-base">{body}</p>}
  </div>
);

const Feature = ({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) => (
  <li className="flex gap-3 rounded-xl bg-surface-container p-4">
    <Icon size={20} className="mt-0.5 shrink-0 text-party-primary" />
    <div>
      <p className="font-display text-title-card">{title}</p>
      <p className="mt-1 text-body-sm text-party-gray">{body}</p>
    </div>
  </li>
);

const LandingPage = () => {
  const { t } = useTranslation();
  const { isLoggedIn, userType } = useAppContext();
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState<'users' | 'venues'>('users');

  // Quien ya ha entrado va directo a su parte de la app.
  const appHome = userType === 'venue' ? '/venue/dashboard' : userType === 'admin' ? '/admin/dashboard' : '/home';

  useEffect(() => {
    document.title = `Vybe · ${t('landing.hero.pill')}`;
  }, [t]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menu]);

  const nav = [
    { href: '#ecosistema', label: t('landing.nav.users'), tab: 'users' as const },
    { href: '#ecosistema', label: t('landing.nav.venues'), tab: 'venues' as const },
    { href: '#como-funciona', label: t('landing.nav.how') },
    { href: '#planes', label: t('landing.nav.plans') },
    { href: '#preguntas', label: t('landing.nav.faq') },
  ];

  const steps: { key: 'access' | 'check' | 'chat'; icon: LucideIcon; dot: string }[] = [
    { key: 'access', icon: ScanLine, dot: 'bg-party-primary' },
    { key: 'check', icon: Zap, dot: 'bg-[#3FE6FF]' },
    { key: 'chat', icon: Clock3, dot: 'bg-[#FFB4AB]' },
  ];

  const userItems: { key: string; icon: LucideIcon }[] = [
    { key: 'matches', icon: UserRoundCheck },
    { key: 'chats', icon: MessageCircleHeart },
    { key: 'offers', icon: Ticket },
    { key: 'sos', icon: ShieldAlert },
    { key: 'map', icon: MapIcon },
  ];

  const venueItems: { key: string; icon: LucideIcon }[] = [
    { key: 'access', icon: QrCode },
    { key: 'capacity', icon: Users },
    { key: 'promoters', icon: TrendingUp },
    { key: 'promotions', icon: Megaphone },
    { key: 'stats', icon: BarChart3 },
    { key: 'team', icon: BadgeCheck },
  ];

  const trust: { key: string; icon: LucideIcon }[] = [
    { key: 'verified', icon: ShieldCheck },
    { key: 'server', icon: ServerCog },
    { key: 'location', icon: MapPinned },
    { key: 'gdpr', icon: LockKeyhole },
  ];

  const planIds: PlanId[] = ['free', 'pro', 'business'];
  const faqs = ['price', 'location', 'visibility', 'venueStart', 'where', 'apps'];

  const usersCard = (
    <div className="flex w-full flex-col rounded-2xl bg-surface-low p-5 lg:p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-party-primary text-ink">
          <Sparkles size={22} />
        </span>
        <div>
          <p className="text-label-pill uppercase tracking-[0.12em] text-party-primary">{t('landing.eco.users.eyebrow')}</p>
          <h3 className="font-display text-headline-lg">{t('landing.eco.users.title')}</h3>
        </div>
      </div>
      <ul className="mt-5 flex-1 space-y-2">
        {userItems.map(({ key, icon }) => (
          <Feature
            key={key}
            icon={icon}
            title={t(`landing.eco.users.items.${key}.title`)}
            body={t(`landing.eco.users.items.${key}.body`)}
          />
        ))}
      </ul>
      <Link
        to={USER_SIGNUP}
        className="press mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card text-ink hover:bg-[#E0BC00]"
      >
        {t('landing.eco.users.cta')}
        <ArrowRight size={17} />
      </Link>
    </div>
  );

  const venuesCard = (
    <div className="flex w-full flex-col rounded-2xl bg-surface-low p-5 lg:p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-high text-[#3FE6FF]">
          <Store size={22} />
        </span>
        <div>
          <p className="text-label-pill uppercase tracking-[0.12em] text-[#3FE6FF]">{t('landing.eco.venues.eyebrow')}</p>
          <h3 className="font-display text-headline-lg">{t('landing.eco.venues.title')}</h3>
        </div>
      </div>
      <ul className="mt-5 flex-1 space-y-2">
        {venueItems.map(({ key, icon }) => (
          <Feature
            key={key}
            icon={icon}
            title={t(`landing.eco.venues.items.${key}.title`)}
            body={t(`landing.eco.venues.items.${key}.body`)}
          />
        ))}
      </ul>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <a
          href="#contacto"
          className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-white font-display text-title-card text-ink hover:bg-white/90"
        >
          {t('landing.eco.venues.cta')}
          <ArrowRight size={17} />
        </a>
        <Link
          to={VENUE_SIGNUP}
          className="press flex h-12 items-center justify-center rounded-xl bg-surface-high font-display text-title-card hover:bg-surface-highest"
        >
          {t('landing.eco.venues.ctaSecondary')}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-background text-foreground">
      {/* ------------------------------------------------------------ cabecera */}
      <header className="pt-safe sticky top-0 z-40 border-b border-white/[0.06] bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-margin lg:h-[72px] lg:px-8">
          <a href="#inicio" className="flex items-center gap-2.5" aria-label="Vybe">
            <VybeMark size={34} />
            <span className="font-display text-headline-lg uppercase tracking-tight">Vybe</span>
          </a>

          <nav className="ml-6 hidden items-center gap-6 lg:flex">
            {nav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => item.tab && setTab(item.tab)}
                className="text-body-md text-party-gray transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher className="hidden sm:flex" />
            {isLoggedIn ? (
              <Link
                to={appHome}
                className="press flex h-10 items-center rounded-xl bg-party-primary px-4 font-display text-title-card text-ink hover:bg-[#E0BC00]"
              >
                {t('landing.nav.openApp')}
              </Link>
            ) : (
              <>
                <Link
                  to={VENUE_SIGNUP}
                  className="press hidden h-10 items-center rounded-xl bg-surface-low px-4 font-display text-title-card hover:bg-surface-high md:flex"
                >
                  {t('landing.nav.registerVenue')}
                </Link>
                <Link
                  to="/auth"
                  className="press flex h-10 items-center rounded-xl bg-party-primary px-4 font-display text-title-card text-ink hover:bg-[#E0BC00]"
                >
                  {t('landing.nav.login')}
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              aria-label={menu ? t('landing.nav.close') : t('landing.nav.menu')}
              className="press flex h-10 w-10 items-center justify-center rounded-xl bg-surface-low lg:hidden"
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {menu && (
          <div className="enter border-t border-white/[0.06] bg-background px-margin pb-5 pt-2 lg:hidden">
            <nav className="flex flex-col">
              {nav.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => {
                    if (item.tab) setTab(item.tab);
                    setMenu(false);
                  }}
                  className="border-b border-white/[0.06] py-3.5 font-display text-headline-md"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="mt-4 flex items-center justify-between gap-3">
              <LanguageSwitcher />
              {!isLoggedIn && (
                <Link
                  to={VENUE_SIGNUP}
                  className="press flex h-11 flex-1 items-center justify-center rounded-xl bg-surface-low font-display text-title-card"
                >
                  {t('landing.nav.registerVenue')}
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="inicio">
        {/* ---------------------------------------------------------- portada */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-party-primary/[0.07] blur-3xl"
          />
          <div className="relative mx-auto max-w-7xl px-margin pb-16 pt-10 lg:px-8 lg:pb-24 lg:pt-20">
            <div className="stagger mx-auto max-w-5xl text-center">
              <p
                style={{ '--i': 0 } as React.CSSProperties}
                className="mx-auto inline-flex items-center gap-2 rounded-full bg-surface-low px-3.5 py-1.5 text-label-pill uppercase tracking-wide text-party-primary"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-party-primary" />
                {t('landing.hero.pill')}
              </p>
              <h1
                style={{ '--i': 1 } as React.CSSProperties}
                className="mt-6 font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[56px] lg:text-[76px]"
              >
                <span className="block">{t('landing.hero.titleStart')}</span>
                <span className="text-party-primary">{t('landing.hero.titleBrand')}</span> {t('landing.hero.titleEnd')}
              </h1>
              <p
                style={{ '--i': 2 } as React.CSSProperties}
                className="mx-auto mt-6 max-w-2xl text-[15px] leading-relaxed text-party-gray sm:text-lg"
              >
                {t('landing.hero.body')}
              </p>
              <div
                style={{ '--i': 3 } as React.CSSProperties}
                className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center"
              >
                <Link
                  to={USER_SIGNUP}
                  className="press flex h-14 items-center justify-center gap-2 rounded-xl bg-party-primary px-7 font-display text-headline-md text-ink hover:bg-[#E0BC00]"
                >
                  <Zap size={19} />
                  {t('landing.hero.ctaUser')}
                </Link>
                <a
                  href="#ecosistema"
                  onClick={() => setTab('venues')}
                  className="press flex h-14 items-center justify-center gap-2 rounded-xl bg-surface-low px-7 font-display text-headline-md hover:bg-surface-high"
                >
                  <Store size={19} />
                  {t('landing.hero.ctaVenue')}
                </a>
              </div>
            </div>

            <div className="mx-auto mt-12 grid max-w-5xl gap-3 lg:mt-16 lg:grid-cols-[1.3fr_1fr]">
              <Reveal className="relative overflow-hidden rounded-2xl bg-surface-low">
                <img
                  src="/landing/hero.webp"
                  alt={t('landing.hero.imageAlt')}
                  width={1800}
                  height={1200}
                  className="h-56 w-full object-cover sm:h-72 lg:h-full"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <div className="absolute inset-x-4 bottom-4">
                  <span className="rounded-full bg-party-primary px-2.5 py-1 text-label-pill uppercase text-ink">
                    {t('landing.hero.imageTag')}
                  </span>
                  <p className="mt-2 font-display text-headline-lg text-white">{t('landing.hero.imageCaption')}</p>
                </div>
              </Reveal>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {[
                  { value: '18+', label: t('landing.hero.facts.adults'), tone: 'text-party-primary' },
                  { value: '0 €', label: t('landing.hero.facts.free'), tone: 'text-foreground' },
                  { value: '1 QR', label: t('landing.hero.facts.qr'), tone: 'text-[#3FE6FF]' },
                ].map((fact, index) => (
                  <Reveal key={fact.value} index={index + 1} className="rounded-2xl bg-surface-low p-5">
                    <p className={cn('font-display text-[34px] font-extrabold leading-none', fact.tone)}>{fact.value}</p>
                    <p className="mt-2 text-body-sm uppercase tracking-wide text-party-gray">{fact.label}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------- cómo funciona */}
        <section id="como-funciona" className="scroll-mt-20 border-y border-white/[0.04] bg-surface-low/40">
          <div className="mx-auto max-w-7xl px-margin py-16 lg:px-8 lg:py-24">
            <Reveal className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading eyebrow={t('landing.how.eyebrow')} title={t('landing.how.title')} />
              <p className="max-w-md text-[15px] leading-relaxed text-party-gray">{t('landing.how.aside')}</p>
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map(({ key, icon: Icon, dot }, index) => (
                <Reveal key={key} index={index} className="flex flex-col rounded-2xl bg-surface-low p-5 lg:p-6">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-xl font-display text-headline-md',
                        index === 0 ? 'bg-party-primary text-ink' : 'bg-surface-high',
                      )}
                    >
                      0{index + 1}
                    </span>
                    <Icon size={26} className="text-party-primary" />
                  </div>
                  <h3 className="mt-5 font-display text-headline-md">{t(`landing.how.steps.${key}.title`)}</h3>
                  <p className="mt-2 flex-1 text-body-md font-normal text-party-gray">{t(`landing.how.steps.${key}.body`)}</p>
                  <p className="mt-5 flex items-center gap-2 rounded-lg bg-surface-container px-3 py-2 text-caption">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                    {t(`landing.how.steps.${key}.tag`)}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- ecosistema */}
        <section id="ecosistema" className="mx-auto max-w-7xl scroll-mt-20 px-margin py-16 lg:px-8 lg:py-24">
          <Reveal>
            <SectionHeading center eyebrow={t('landing.eco.eyebrow')} title={t('landing.eco.title')} body={t('landing.eco.body')} />
          </Reveal>

          {/* En el móvil las dos columnas son pestañas, como en el diseño. */}
          <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-1 rounded-xl bg-surface-low p-1 lg:hidden" role="tablist">
            {(['users', 'venues'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'press flex h-11 items-center justify-center gap-2 rounded-lg font-display text-title-card',
                  tab === id ? 'bg-party-primary text-ink' : 'text-party-gray',
                )}
              >
                {id === 'users' ? <Users size={17} /> : <Store size={17} />}
                {t(`landing.eco.tabs.${id}`)}
              </button>
            ))}
          </div>

          {/* Una sola rejilla: en escritorio se ven las dos; en el móvil, la
              pestaña elegida. */}
          <Reveal className="mt-6 grid gap-5 lg:mt-12 lg:grid-cols-2">
            <div className={cn('flex', tab !== 'users' && 'hidden lg:flex')}>{usersCard}</div>
            <div className={cn('flex', tab !== 'venues' && 'hidden lg:flex')}>{venuesCard}</div>
          </Reveal>
        </section>

        {/* --------------------------------------------------------- en acción */}
        <section className="border-y border-white/[0.04] bg-surface-low/40">
          <div className="mx-auto max-w-7xl px-margin py-16 lg:px-8 lg:py-24">
            <Reveal>
              <SectionHeading center eyebrow={t('landing.showcase.eyebrow')} title={t('landing.showcase.title')} body={t('landing.showcase.body')} />
            </Reveal>
            <div className="mt-10 grid items-center gap-6 lg:grid-cols-[360px_1fr] lg:gap-10">
              <Reveal>
                <PhoneMock />
              </Reveal>
              <Reveal index={1}>
                <PanelMock />
              </Reveal>
            </div>
            <p className="mt-4 text-center text-caption font-normal text-party-gray">{t('landing.showcase.sample')}</p>
          </div>
        </section>

        {/* ------------------------------------------------------- seguridad */}
        <section className="mx-auto max-w-7xl px-margin py-16 lg:px-8 lg:py-24">
          <Reveal>
            <SectionHeading eyebrow={t('landing.trust.eyebrow')} title={t('landing.trust.title')} />
          </Reveal>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {trust.map(({ key, icon: Icon }, index) => (
              <Reveal key={key} index={index} className="rounded-2xl bg-surface-low p-5">
                <Icon size={24} className="text-party-primary" />
                <h3 className="mt-4 font-display text-title-card">{t(`landing.trust.items.${key}.title`)}</h3>
                <p className="mt-1.5 text-body-sm text-party-gray">{t(`landing.trust.items.${key}.body`)}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------- planes */}
        <section id="planes" className="scroll-mt-20 border-y border-white/[0.04] bg-surface-low/40">
          <div className="mx-auto max-w-7xl px-margin py-16 lg:px-8 lg:py-24">
            <Reveal>
              <SectionHeading center eyebrow={t('landing.plans.eyebrow')} title={t('landing.plans.title')} body={t('landing.plans.body')} />
            </Reveal>
            <div className="mx-auto mt-10 grid max-w-5xl gap-4 md:grid-cols-3">
              {planIds.map((id, index) => {
                const plan = PLANS[id];
                const destacado = id === 'pro';
                return (
                  <Reveal
                    key={id}
                    index={index}
                    className={cn(
                      'relative flex flex-col rounded-2xl p-5 lg:p-6',
                      destacado ? 'bg-party-primary text-ink' : 'bg-surface-low',
                    )}
                  >
                    <p className="flex items-center justify-between gap-2 font-display text-headline-lg">
                      {t(`venue.plan.names.${id}`)}
                      {destacado && (
                        <span className="rounded-full bg-ink px-2.5 py-1 text-label-pill uppercase text-party-primary">
                          {t('landing.plans.recommended')}
                        </span>
                      )}
                    </p>
                    <p className={cn('mt-1 text-body-sm', destacado ? 'text-ink/70' : 'text-party-gray')}>
                      {t(`venue.plan.taglines.${id}`)}
                    </p>
                    <p className="mt-5 font-display text-[32px] font-extrabold leading-none">
                      {id === 'free' ? t('landing.plans.free') : t('landing.plans.custom')}
                    </p>
                    <ul className="mt-5 flex-1 space-y-2.5 text-body-md">
                      <li className="flex items-center gap-2">
                        <Check size={16} className="shrink-0" />
                        {t('venue.plan.eventsIncluded', { count: plan.events })}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check size={16} className="shrink-0" />
                        {t('venue.plan.teamIncluded', { count: plan.team })}
                      </li>
                      {PLAN_FEATURES.map((feature) => (
                        <li
                          key={feature}
                          className={cn(
                            'flex items-center gap-2',
                            !plan.features[feature] && (destacado ? 'text-ink/40 line-through' : 'text-party-gray/60 line-through'),
                          )}
                        >
                          {plan.features[feature] ? <Check size={16} className="shrink-0" /> : <X size={16} className="shrink-0" />}
                          {t(`venue.plan.features.${feature}`)}
                        </li>
                      ))}
                    </ul>
                    {id === 'free' ? (
                      <Link
                        to={VENUE_SIGNUP}
                        className="press mt-6 flex h-12 items-center justify-center rounded-xl bg-surface-high font-display text-title-card hover:bg-surface-highest"
                      >
                        {t('landing.plans.ctaFree')}
                      </Link>
                    ) : (
                      <a
                        href="#contacto"
                        className={cn(
                          'press mt-6 flex h-12 items-center justify-center rounded-xl font-display text-title-card',
                          destacado ? 'bg-ink text-white hover:bg-ink/90' : 'bg-white text-ink hover:bg-white/90',
                        )}
                      >
                        {t('landing.plans.ctaPaid')}
                      </a>
                    )}
                  </Reveal>
                );
              })}
            </div>
            <p className="mt-6 text-center text-body-sm text-party-gray">{t('landing.plans.base')}</p>
          </div>
        </section>

        {/* -------------------------------------------------------- preguntas */}
        <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-20 px-margin py-16 lg:py-24">
          <Reveal>
            <SectionHeading center eyebrow={t('landing.faq.eyebrow')} title={t('landing.faq.title')} />
          </Reveal>
          <Accordion type="single" collapsible className="mt-8">
            {faqs.map((key) => (
              <AccordionItem key={key} value={key} className="border-white/[0.08]">
                <AccordionTrigger className="text-left font-display text-headline-md hover:no-underline">
                  {t(`landing.faq.items.${key}.q`)}
                </AccordionTrigger>
                <AccordionContent className="text-[15px] leading-relaxed text-party-gray">
                  {t(`landing.faq.items.${key}.a`)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* ------------------------------------------------ llamada y contacto */}
        <section id="contacto" className="scroll-mt-20 px-margin pb-16 lg:px-8 lg:pb-24">
          <div className="mx-auto grid max-w-7xl items-center gap-8 rounded-[28px] bg-surface-container p-5 sm:p-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-12 lg:p-14">
            <Reveal>
              <p className="text-label-pill uppercase tracking-[0.12em] text-party-primary">{t('landing.cta.eyebrow')}</p>
              <h2 className="mt-2 font-display text-[32px] font-extrabold leading-[1.05] tracking-tight sm:text-[44px] lg:text-[54px]">
                {t('landing.cta.title')}
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-party-gray lg:text-base">{t('landing.cta.body')}</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={USER_SIGNUP}
                  className="press flex h-12 items-center justify-center gap-2 rounded-xl bg-party-primary px-6 font-display text-title-card text-ink hover:bg-[#E0BC00]"
                >
                  <Zap size={17} />
                  {t('landing.cta.user')}
                </Link>
                <Link
                  to="/auth"
                  className="press flex h-12 items-center justify-center rounded-xl bg-surface-high px-6 font-display text-title-card hover:bg-surface-highest"
                >
                  {t('landing.cta.login')}
                </Link>
              </div>
              <p className="mt-4 flex items-center gap-2 text-body-sm text-party-gray">
                <Smartphone size={16} />
                {t('landing.cta.stores')}
              </p>
            </Reveal>
            <Reveal index={1}>
              <VenueLeadForm />
            </Reveal>
          </div>
        </section>
      </main>

      {/* --------------------------------------------------------------- pie */}
      <footer className="pb-safe border-t border-white/[0.06] bg-surface-low/60">
        <div className="mx-auto grid max-w-7xl gap-10 px-margin py-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <VybeMark size={34} />
              <span className="font-display text-headline-lg uppercase tracking-tight">Vybe</span>
            </div>
            <p className="mt-4 max-w-sm text-body-md font-normal text-party-gray">{t('landing.footer.tagline')}</p>
          </div>
          {[
            {
              title: t('landing.footer.users'),
              links: [
                { to: USER_SIGNUP, label: t('landing.footer.signup') },
                { to: '/auth?type=user', label: t('landing.footer.login') },
                { href: '#como-funciona', label: t('landing.nav.how') },
                { href: '#preguntas', label: t('landing.nav.faq') },
              ],
            },
            {
              title: t('landing.footer.venues'),
              links: [
                { to: VENUE_SIGNUP, label: t('landing.footer.registerVenue') },
                { to: '/auth?type=venue', label: t('landing.footer.venueLogin') },
                { href: '#planes', label: t('landing.nav.plans') },
                { href: '#contacto', label: t('landing.footer.demo') },
              ],
            },
            {
              title: t('landing.footer.legal'),
              links: [
                { to: '/legal/privacy', label: t('landing.footer.privacy') },
                { to: '/legal/terms', label: t('landing.footer.terms') },
                { href: `mailto:${COMPANY.email}`, label: t('landing.footer.contact') },
              ],
            },
          ].map((col) => (
            <div key={col.title}>
              <p className="font-display text-title-card uppercase tracking-wide">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {'to' in link && link.to ? (
                      <Link to={link.to} className="text-body-md font-normal text-party-gray hover:text-foreground">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="text-body-md font-normal text-party-gray hover:text-foreground">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-white/[0.06] px-margin py-5 text-caption font-normal text-party-gray sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>{t('landing.footer.rights', { year: new Date().getFullYear() })}</p>
          <p className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-party-primary" />
            {t('landing.footer.made')}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
