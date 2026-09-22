import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, EyeOff, LogOut, ShieldAlert, Sparkles } from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import EventOffers from '@/components/event-offers';
import SafetySheet from '@/components/safety-sheet';
import FollowVenuePrompt from '@/components/follow-venue-prompt';
import { EventModeSwitch } from '@/components/event-mode';
import AccountTypeCard from '@/components/account-type-card';
import { EventActionButton } from '@/components/ui-custom/event-action-button';
import { useAppContext } from '@/context/app-context';
import { formatHourRange } from '@/components/event-bits';

/**
 * La fiesta en modo invitado.
 *
 * Aquí no hay tablón: ni se ve ni se sale en él. Queda lo del local —ofertas,
 * retos, sorteos y sus avisos— y el botón para pasarse a vyber si al final
 * apetece conocer a alguien.
 */
const GuestEventPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeEvent, currentUser, leaveEvent } = useAppContext();

  const [showSafety, setShowSafety] = useState(false);


  if (!activeEvent) return null;

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+2rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto w-full max-w-md space-y-5 px-margin pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/home')}
            aria-label={t('common.back')}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex min-w-0 flex-1 justify-center">
            <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-party-primary px-3 py-1.5 text-label-pill text-ink">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-ink" />
              <span className="truncate">{activeEvent.eventName}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowSafety(true)}
            aria-label={t('safety.shortTitle')}
            className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-foreground"
          >
            <ShieldAlert size={19} />
          </button>
        </div>

        <section className="rounded-3xl bg-surface-low p-5 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-party-primary text-ink">
            <EyeOff size={26} />
          </span>
          <h1 className="font-display text-headline-lg">{t('eventMode.guest.title')}</h1>
          <p className="mt-1 text-body-md text-party-gray">{t('eventMode.guest.hereBody')}</p>
          <p className="mt-3 text-caption text-party-gray">
            {t('eventMode.until', { time: formatHourRange(activeEvent.startDate, activeEvent.endDate) })}
          </p>
        </section>

        <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
          <EventOffers eventId={activeEvent.eventId} />
          {/* Un vyber que entró como invitado puede volver a su modo. */}
          {currentUser?.accountType === 'vyber' && <EventModeSwitch mode="guest" />}
          <EventActionButton
            icon={LogOut}
            label={t('swiping.exitShort')}
            onClick={() => {
              leaveEvent();
              navigate('/home');
            }}
            tone="danger"
          />
        </div>

        <section className="space-y-2 rounded-2xl bg-surface-low p-4">
          <p className="flex items-center gap-2 font-display text-title-card">
            <Sparkles size={16} className="text-party-primary" />
            {t('eventMode.guestPerks')}
          </p>
          <ul className="space-y-1.5 text-body-sm text-party-gray">
            {['offers', 'alerts', 'private'].map((key) => (
              <li key={key}>· {t(`eventMode.perks.${key}`)}</li>
            ))}
          </ul>
        </section>

        {/* La cuenta de invitado puede hacerse Vyber desde aquí mismo, con
            las mismas reglas que en el perfil. */}
        {currentUser?.accountType === 'guest' && <AccountTypeCard />}

        {activeEvent.venueId && (
          <FollowVenuePrompt
            venueId={activeEvent.venueId}
            venueName={activeEvent.venueName ?? activeEvent.eventName}
          />
        )}
      </main>

      <SafetySheet open={showSafety} onOpenChange={setShowSafety} />
      <Footer />
    </div>
  );
};

export default GuestEventPage;
