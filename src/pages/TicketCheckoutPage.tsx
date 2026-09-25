import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Armchair, ArrowLeft, CalendarDays, Crown, Loader2, Minus, Plus, ShieldCheck, Ticket } from 'lucide-react';
import Header from '@/components/header';
import { formatHourRange } from '@/components/event-bits';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { ApiError } from '@/services/api';
import { isNative, openExternal } from '@/services/native';
import { euros, TicketCheckoutInfo, TicketHolder, ticketsService } from '@/services/tickets';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';

/**
 * Comprar entradas de una fiesta (migración 077).
 *
 * Lo que incluye, cuántas, los datos de cada asistente (van impresos en su
 * entrada y a su correo le llega la suya), las condiciones de Fiestea y las
 * del negocio, y el resumen. Las gratis también se «compran»: así tienen su
 * QR, su PDF y su correo como las de pago.
 */

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Asistente = TicketHolder & { emailConfirm: string };

const vacio = (): Asistente => ({ name: '', email: '', emailConfirm: '', phone: '', birthdate: '' });

/** Años cumplidos el día de la fiesta. */
const edadEn = (nacimiento: string, dia: string): number => {
  const n = new Date(`${nacimiento}T12:00:00`);
  const d = new Date(dia);
  let edad = d.getFullYear() - n.getFullYear();
  if (d.getMonth() < n.getMonth() || (d.getMonth() === n.getMonth() && d.getDate() < n.getDate())) edad -= 1;
  return edad;
};

const TicketCheckoutPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser: user } = useAppContext();
  const { typeId = '' } = useParams();
  const [searchParams] = useSearchParams();

  const [info, setInfo] = useState<TicketCheckoutInfo | null | undefined>(undefined);
  const [cantidad, setCantidad] = useState(() => Math.max(1, Number(searchParams.get('qty')) || 1));
  const [asistentes, setAsistentes] = useState<Asistente[]>([vacio()]);
  const [aceptaFiestea, setAceptaFiestea] = useState(false);
  const [aceptaNegocio, setAceptaNegocio] = useState(false);
  const [publicidad, setPublicidad] = useState(false);
  const [aMiCuenta, setAMiCuenta] = useState(true);
  const [verCondiciones, setVerCondiciones] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [pagando, setPagando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void ticketsService.getCheckout(typeId).then((datos) => {
      if (vivo) setInfo(datos);
    });
    return () => {
      vivo = false;
    };
  }, [typeId]);

  // El primer asistente es quien compra: sus datos van ya puestos.
  useEffect(() => {
    if (!user) return;
    setAsistentes((prev) => {
      const [primero, ...resto] = prev;
      if (primero.name || primero.email) return prev;
      const correo = user.email ?? '';
      return [{ ...primero, name: user.name ?? '', email: correo, emailConfirm: correo, phone: user.phone ?? '' }, ...resto];
    });
  }, [user]);

  const esMesa = info?.kind === 'table';
  const tope = info ? Math.max(1, Math.min(info.maxPerOrder, info.remaining ?? info.maxPerOrder)) : 1;
  const unidades = esMesa ? 1 : Math.min(cantidad, tope);

  // Un formulario por entrada: se añaden o quitan al cambiar la cantidad.
  useEffect(() => {
    setAsistentes((prev) =>
      prev.length === unidades
        ? prev
        : prev.length > unidades
          ? prev.slice(0, unidades)
          : [...prev, ...Array.from({ length: unidades - prev.length }, vacio)],
    );
  }, [unidades]);

  const errores = useMemo(() => {
    if (!info) return [] as Record<string, string>[];
    return asistentes.map((a, i) => {
      const e: Record<string, string> = {};
      if (a.name.trim().length < 3 || !a.name.trim().includes(' ')) e.name = 'tickets.checkout.errors.fullName';
      const pideCorreo = i === 0 || a.email.trim() !== '';
      if (pideCorreo && !CORREO.test(a.email.trim())) e.email = 'tickets.checkout.errors.email';
      if (pideCorreo && a.email.trim().toLowerCase() !== a.emailConfirm.trim().toLowerCase()) {
        e.emailConfirm = 'tickets.checkout.errors.emailMatch';
      }
      if (i === 0 && a.phone.replace(/\D/g, '').length < 9) e.phone = 'tickets.checkout.errors.phone';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(a.birthdate)) e.birthdate = 'tickets.checkout.errors.birthdate';
      else if (info.minAge && edadEn(a.birthdate, info.startDate) < info.minAge) e.birthdate = 'tickets.checkout.errors.minAge';
      return e;
    });
  }, [asistentes, info]);

  if (info === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-headline-md">{t('tickets.checkout.notFound')}</p>
        <button type="button" onClick={() => navigate(-1)} className="press text-body-sm underline">
          {t('common.back')}
        </button>
      </div>
    );
  }

  const gratis = info.priceCents === 0;
  const total = info.priceCents * unidades;
  const agotada = info.remaining !== null && info.remaining <= 0;
  const hayCondiciones = Boolean(info.venueTerms?.trim());
  const datosOk = errores.every((e) => Object.keys(e).length === 0);
  const casillasOk = aceptaFiestea && (!hayCondiciones || aceptaNegocio);
  const Icono = esMesa ? Armchair : info.kind === 'vip' ? Crown : Ticket;

  const cambiar = (i: number, campo: keyof Asistente, valor: string) =>
    setAsistentes((prev) => prev.map((a, j) => (j === i ? { ...a, [campo]: valor } : a)));

  const pagar = async () => {
    setIntentado(true);
    if (!datosOk || !casillasOk) {
      toast({ title: t('tickets.checkout.errors.review'), variant: 'destructive' });
      return;
    }
    setPagando(true);
    try {
      const resultado = await ticketsService.startCheckout({
        ticketTypeId: info.typeId,
        quantity: unidades,
        holders: asistentes.map(({ name, email, phone, birthdate }) => ({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          birthdate,
        })),
        buyerEmail: asistentes[0].email.trim().toLowerCase(),
        addToAccount: aMiCuenta,
        marketing: publicidad,
        acceptTerms: true,
      });
      track('tickets_checkout', { kind: info.kind, quantity: unidades, free: resultado.free });
      if (resultado.free || !resultado.url) {
        navigate(`/tickets/order/${resultado.orderId}`, { replace: true });
        return;
      }
      // En el navegador, Stripe vuelve a esta misma pestaña; en la app, al
      // navegador del sistema y de ahí a la app por `pago.html`.
      if (isNative()) {
        await openExternal(resultado.url, { system: true });
        navigate(`/tickets/order/${resultado.orderId}`, { replace: true });
      } else {
        window.location.assign(resultado.url);
      }
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'tickets.buy.errors.checkout';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
      void ticketsService.getCheckout(typeId).then(setInfo);
    } finally {
      setPagando(false);
    }
  };

  const fecha = new Date(info.startDate).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const campo = (i: number, nombre: keyof Asistente, props: React.ComponentProps<typeof Input> & { label: string }) => {
    const { label, ...resto } = props;
    const error = intentado ? errores[i]?.[nombre] : undefined;
    return (
      <label className="flex flex-col gap-1">
        <span className="text-caption font-bold text-party-gray">{label}</span>
        <Input
          value={asistentes[i][nombre]}
          onChange={(e) => cambiar(i, nombre, e.target.value)}
          aria-invalid={Boolean(error)}
          className={cn(error && 'border-destructive')}
          {...resto}
        />
        {error && <span className="text-caption text-destructive">{t(error, { age: info.minAge })}</span>}
      </label>
    );
  };

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen pb-[calc(var(--nav-h)+7rem)] pt-[var(--header-h)]">
      <Header />

      <main className="mx-auto max-w-2xl space-y-5 px-margin pt-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="press flex h-10 w-10 items-center justify-center rounded-full bg-surface-low"
        >
          <ArrowLeft size={20} />
        </button>

        {/* ------------------------------------------------------------ fiesta */}
        <section className="flex items-center gap-3">
          {info.venueLogo ? (
            <img src={info.venueLogo} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-party-primary font-display text-title-card font-black text-ink">
              {info.venueName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-caption font-bold uppercase text-party-primary">{info.venueName}</p>
            <h1 className="font-display text-headline-md leading-tight">{info.eventName}</h1>
            <p className="flex items-center gap-1.5 text-body-sm text-party-gray">
              <CalendarDays size={14} />
              <span className="first-letter:uppercase">{fecha}</span> · {formatHourRange(info.startDate, info.endDate)}
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------------- tipo */}
        <section className="rounded-2xl bg-white p-4 text-ink">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-party-primary">
              <Icono size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-title-card">{info.name}</p>
              {esMesa && (info.guests || info.minSpendCents) && (
                <p className="text-caption text-ink/60">
                  {[
                    info.guests ? t('tickets.buy.guests', { count: info.guests }) : null,
                    info.minSpendCents ? t('tickets.buy.minSpend', { amount: euros(info.minSpendCents) }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
            <p className="shrink-0 font-display text-title-card">{gratis ? t('tickets.buy.free') : euros(info.priceCents)}</p>
          </div>
          {info.description && (
            <div className="mt-3 border-t border-black/10 pt-3">
              <p className="text-caption font-bold uppercase text-ink/50">{t('tickets.checkout.includes')}</p>
              <p className="mt-1 whitespace-pre-line text-body-sm">{info.description}</p>
            </div>
          )}
          {(info.minAge || info.dressCode) && (
            <p className="mt-3 text-caption text-ink/60">
              {[
                info.minAge ? t('tickets.checkout.minAge', { age: info.minAge }) : null,
                info.dressCode ? t('tickets.checkout.dressCode', { code: info.dressCode }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {!esMesa && !agotada && tope > 1 && (
            <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-3">
              <span className="text-body-sm font-bold">{t('tickets.checkout.quantity')}</span>
              <div className="flex h-11 items-center rounded-xl border border-black/10">
                <button
                  type="button"
                  aria-label="-1"
                  disabled={unidades <= 1}
                  onClick={() => setCantidad(unidades - 1)}
                  className="press flex h-11 w-11 items-center justify-center disabled:opacity-30"
                >
                  <Minus size={16} />
                </button>
                <span className="w-7 text-center font-bold tabular">{unidades}</span>
                <button
                  type="button"
                  aria-label="+1"
                  disabled={unidades >= tope}
                  onClick={() => setCantidad(unidades + 1)}
                  className="press flex h-11 w-11 items-center justify-center disabled:opacity-30"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )}
          {info.remaining !== null && !agotada && info.remaining <= 20 && (
            <p className="mt-2 text-caption font-bold text-destructive">{t('tickets.buy.remaining', { count: info.remaining })}</p>
          )}
        </section>

        {agotada || !info.purchasable ? (
          <p className="rounded-2xl bg-surface-low p-4 text-center text-body-sm font-bold">
            {agotada ? t('tickets.buy.soldOut') : t('tickets.buy.errors.closed')}
          </p>
        ) : (
          <>
            {/* ------------------------------------------------------ asistentes */}
            {asistentes.map((_, i) => (
              <section key={i} className="space-y-3 rounded-2xl bg-surface-low p-4">
                <h2 className="font-display text-title-card">
                  {unidades > 1
                    ? t(esMesa ? 'tickets.checkout.holderTable' : 'tickets.checkout.holderN', { n: i + 1 })
                    : t(esMesa ? 'tickets.checkout.holderTable' : 'tickets.checkout.holder')}
                </h2>
                {i > 0 && <p className="-mt-2 text-caption text-party-gray">{t('tickets.checkout.otherHolderHelp')}</p>}
                {campo(i, 'name', { label: t('tickets.checkout.fullName'), autoComplete: i === 0 ? 'name' : 'off' })}
                <div className="grid gap-3 sm:grid-cols-2">
                  {campo(i, 'email', {
                    label: i === 0 ? t('tickets.checkout.email') : t('tickets.checkout.emailOptional'),
                    type: 'email',
                    inputMode: 'email',
                    autoCapitalize: 'none',
                    autoComplete: i === 0 ? 'email' : 'off',
                  })}
                  {campo(i, 'emailConfirm', {
                    label: t('tickets.checkout.emailConfirm'),
                    type: 'email',
                    inputMode: 'email',
                    autoCapitalize: 'none',
                    autoComplete: 'off',
                    onPaste: (e) => e.preventDefault(),
                  })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {campo(i, 'phone', {
                    label: i === 0 ? t('tickets.checkout.phone') : t('tickets.checkout.phoneOptional'),
                    type: 'tel',
                    inputMode: 'tel',
                    autoComplete: i === 0 ? 'tel' : 'off',
                  })}
                  {campo(i, 'birthdate', { label: t('tickets.checkout.birthdate'), type: 'date', max: hoy, min: '1920-01-01' })}
                </div>
              </section>
            ))}

            {/* -------------------------------------------------------- casillas */}
            <section className="space-y-3 rounded-2xl bg-surface-low p-4">
              <Casilla
                id="acepta-fiestea"
                checked={aceptaFiestea}
                onChange={setAceptaFiestea}
                error={intentado && !aceptaFiestea}
              >
                <Trans
                  i18nKey="tickets.checkout.acceptFiestea"
                  components={{
                    terms: <Link to="/legal/terminos" target="_blank" className="font-semibold underline" />,
                    purchases: <Link to="/legal/compras" target="_blank" className="font-semibold underline" />,
                    privacy: <Link to="/legal/privacidad" target="_blank" className="font-semibold underline" />,
                  }}
                />
              </Casilla>
              {hayCondiciones && (
                <Casilla
                  id="acepta-negocio"
                  checked={aceptaNegocio}
                  onChange={setAceptaNegocio}
                  error={intentado && !aceptaNegocio}
                >
                  <Trans
                    i18nKey="tickets.checkout.acceptVenue"
                    values={{ venue: info.venueName }}
                    components={{
                      open: (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setVerCondiciones(true);
                          }}
                          className="font-semibold underline"
                        />
                      ),
                    }}
                  />
                </Casilla>
              )}
              <Casilla id="publicidad" checked={publicidad} onChange={setPublicidad}>
                {t('tickets.checkout.marketing', { venue: info.venueName })}
              </Casilla>
              <Casilla id="a-mi-cuenta" checked={aMiCuenta} onChange={setAMiCuenta}>
                {t('tickets.checkout.addToAccount')}
              </Casilla>
            </section>

            {/* --------------------------------------------------------- resumen */}
            <section className="rounded-2xl bg-surface-low p-4">
              <h2 className="font-display text-title-card">{t('tickets.checkout.summary')}</h2>
              <dl className="mt-2 space-y-1 text-body-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-party-gray">
                    {unidades} × {info.name}
                  </dt>
                  <dd className="tabular">{gratis ? t('tickets.buy.free') : euros(total)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-white/10 pt-2 font-bold">
                  <dt>{t('tickets.checkout.total')}</dt>
                  <dd className="tabular">{gratis ? t('tickets.buy.free') : euros(total)}</dd>
                </div>
              </dl>
              <p className="mt-3 flex items-start gap-1.5 text-caption text-party-gray">
                <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                {gratis ? t('tickets.checkout.freeNote') : t('tickets.checkout.paidNote', { venue: info.venueName })}
              </p>
            </section>
          </>
        )}
      </main>

      {!agotada && info.purchasable && (
        <div className="fixed inset-x-0 bottom-[var(--nav-h)] z-30 border-t border-white/10 bg-background/95 px-margin py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0">
              <p className="text-caption text-party-gray">{t('tickets.checkout.total')}</p>
              <p className="font-display text-title-card tabular">{gratis ? t('tickets.buy.free') : euros(total)}</p>
            </div>
            <button
              type="button"
              disabled={pagando}
              onClick={() => void pagar()}
              className="press flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-party-primary px-4 font-bold text-ink disabled:opacity-50"
            >
              {pagando && <Loader2 size={16} className="animate-spin" />}
              {gratis ? t('tickets.checkout.getFree') : t('tickets.checkout.pay', { amount: euros(total) })}
            </button>
          </div>
        </div>
      )}

      <Dialog open={verCondiciones} onOpenChange={setVerCondiciones}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('tickets.checkout.venueTerms', { venue: info.venueName })}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-line text-body-sm">{info.venueTerms}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Casilla = ({
  id,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: boolean;
  children: React.ReactNode;
}) => (
  <div className="flex items-start gap-3">
    <Checkbox
      id={id}
      checked={checked}
      onCheckedChange={(v) => onChange(v === true)}
      className={cn('mt-0.5 shrink-0', error && 'border-destructive')}
    />
    <label htmlFor={id} className={cn('cursor-pointer text-body-sm leading-snug', error && 'text-destructive')}>
      {children}
    </label>
  </div>
);

export default TicketCheckoutPage;
