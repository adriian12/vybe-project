import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { COMPANY } from '@/lib/company';
import { cn } from '@/lib/utils';
import { ApiError } from '@/services/api';
import { LEAD_VENUE_TYPES, LeadVenueType, leadsService } from '@/services/leads';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()-]{9,20}$/;

const fieldClass =
  'h-12 w-full rounded-xl border border-transparent bg-surface px-4 text-body-md text-foreground placeholder:text-party-gray focus:border-party-primary focus:outline-none';

/**
 * «¿Tienes una discoteca, bar o festival?»: el formulario de la landing que
 * convierte a un local en una solicitud de demo.
 *
 * Valida aquí para avisar sin esperar, pero la validación que cuenta es la de
 * la Edge Function `venue-lead`. El campo `website` está fuera de la vista y
 * del orden de tabulación: sólo lo rellena un robot.
 */
const VenueLeadForm = () => {
  const { t, i18n } = useTranslation();

  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('');
  const [venueType, setVenueType] = useState<LeadVenueType | ''>('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (venueName.trim().length < 2 || city.trim().length < 2) {
      setError('landing.form.errors.fields');
      return;
    }
    if (!EMAIL_RE.test(contact.trim()) && !PHONE_RE.test(contact.trim())) {
      setError('landing.form.errors.contact');
      return;
    }
    if (!consent) {
      setError('landing.form.errors.consent');
      return;
    }

    setSending(true);
    try {
      await leadsService.submit({
        venueName: venueName.trim(),
        city: city.trim(),
        venueType,
        contact: contact.trim(),
        message: message.trim(),
        consent,
        website,
        locale: i18n.resolvedLanguage ?? 'es',
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'landing.form.errors.generic');
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setVenueName('');
    setCity('');
    setVenueType('');
    setContact('');
    setMessage('');
    setConsent(false);
    setSent(false);
  };

  if (sent) {
    return (
      <div className="enter flex min-h-[420px] flex-col items-center justify-center rounded-2xl bg-surface-low p-6 text-center lg:p-8">
        <CheckCircle2 size={48} className="text-party-primary" />
        <h3 className="mt-4 font-display text-headline-xl">{t('landing.form.successTitle')}</h3>
        <p className="mt-2 max-w-xs text-body-md text-party-gray">{t('landing.form.successBody')}</p>
        <button
          type="button"
          onClick={reset}
          className="press mt-6 rounded-xl px-4 py-2 text-body-md font-bold text-party-primary hover:bg-white/[0.04]"
        >
          {t('landing.form.again')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="rounded-2xl bg-surface-low p-5 lg:p-7">
      <h3 className="font-display text-headline-lg">{t('landing.form.title')}</h3>
      <p className="mt-1 text-body-md text-party-gray">{t('landing.form.body')}</p>

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="sr-only">{t('landing.form.venueName')}</span>
          <input
            className={fieldClass}
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder={t('landing.form.venueName')}
            autoComplete="organization"
            maxLength={120}
            required
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="sr-only">{t('landing.form.city')}</span>
            <input
              className={fieldClass}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t('landing.form.city')}
              autoComplete="address-level2"
              maxLength={80}
              required
            />
          </label>
          <label className="block">
            <span className="sr-only">{t('landing.form.type')}</span>
            <select
              className={cn(fieldClass, 'appearance-none', !venueType && 'text-party-gray')}
              value={venueType}
              onChange={(e) => setVenueType(e.target.value as LeadVenueType | '')}
            >
              <option value="">{t('landing.form.type')}</option>
              {LEAD_VENUE_TYPES.map((type) => (
                <option key={type} value={type} className="text-foreground">
                  {t(`landing.form.types.${type}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="sr-only">{t('landing.form.contact')}</span>
          <input
            className={fieldClass}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t('landing.form.contact')}
            autoComplete="email"
            maxLength={160}
            required
          />
        </label>

        <label className="block">
          <span className="sr-only">{t('landing.form.message')}</span>
          <textarea
            className={cn(fieldClass, 'h-24 resize-none py-3')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('landing.form.message')}
            maxLength={1000}
          />
        </label>

        {/* Trampa para robots: fuera de la vista y del teclado. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
        </div>

        <label className="flex cursor-pointer items-start gap-3 pt-1 text-body-sm text-party-gray">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#F8D000]"
          />
          <span>
            <Trans
              i18nKey="landing.form.consent"
              components={{
                privacy: <Link to="/legal/privacy" className="text-foreground underline underline-offset-2" />,
              }}
            />
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-body-sm font-bold text-destructive">
          {t(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="press mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card text-ink hover:bg-[#E0BC00] disabled:opacity-60"
      >
        {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
        {sending ? t('landing.form.sending') : t('landing.form.submit')}
      </button>

      <p className="mt-3 text-center text-caption font-normal text-party-gray">
        {t('landing.form.orEmail', { email: COMPANY.email })}
      </p>
    </form>
  );
};

export default VenueLeadForm;
