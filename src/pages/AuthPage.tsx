import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useForm, Control, FieldErrors, FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Building, Upload, User as UserIcon, X,
  Info,
} from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import PhoneInput from '@/components/ui-custom/phone-input';
import AccountKindInfo, { AccountKind } from '@/components/account-kind-info';
import PasswordInput from '@/components/ui-custom/password-input';
import { VybeMark } from '@/components/brand/vybe-logo';
import ForgotPassword from '@/components/forgot-password';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import LanguageSwitcher from '@/components/language-switcher';
import { useAppContext } from '@/context/app-context';
import { supabase } from '@/integrations/supabase/client';
import {
  authEmailService,
  authEmailMessage,
  AuthEmailFailure,
} from '@/services/auth-email';
import { api } from '@/services/api';
import { isValidNif, normalizeNif } from '@/lib/nif';
import { track } from '@/lib/observability';
import { DOWNLOAD_PATH, DownloadReason, landingHref, siteMode } from '@/lib/hosts';
import { VENUE_RADIUS, VenueType } from '@/types/venue';
import SocialLoginButtons from '@/components/social-login-buttons';
import PhoneAuthForm from '@/components/phone-auth-form';
import { PHONE_SIGNUP } from '@/lib/features';

const VENUE_TYPES: VenueType[] = [
  'discoteca',
  'bar',
  'local',
  'fiesta_privada',
  'evento_empresarial',
  'festival',
];

/** El mismo límite que anuncia `auth.maxFileSize`. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Traduce los mensajes de Supabase Auth, que llegan siempre en inglés. */
const authErrorMessage = (message: string, t: Translate): string => {
  if (message.includes('Invalid login credentials')) return t('auth.errors.invalidCredentials');
  if (message.includes('Email not confirmed')) return t('auth.errors.emailNotConfirmed');
  if (message.includes('User already registered')) return t('auth.errors.alreadyRegistered');
  if (message.includes('rate limit') || message.includes('Too many')) {
    return t('auth.errors.tooManyAttempts');
  }
  return message || t('errors.generic');
};

const useValidationToast = () => {
  const { toast } = useToast();
  const { t } = useTranslation();

  return useCallback(
    (errors: FieldErrors) => {
      const first = Object.values(errors)[0];
      if (first?.message) {
        toast({
          title: t('auth.errors.checkForm'),
          description: String(first.message),
          variant: 'destructive',
        });
      }
    },
    [toast, t],
  );
};

// ============================================================================
// Esquemas (se construyen con `t` para que los mensajes estén traducidos)
// ============================================================================

const buildLoginSchema = (t: Translate) =>
  z.object({
    email: z.string().email({ message: t('auth.errors.invalidEmail') }),
    password: z.string().min(1, { message: t('auth.errors.passwordRequired') }),
  });

/**
 * Un número en formato internacional: `+` y de 8 a 15 dígitos.
 *
 * Se valida el conjunto y no sólo la longitud porque el campo ya trae el
 * prefijo puesto: si sólo se comprobara que hay nueve dígitos, un «+34» a secas
 * pasaría el filtro.
 */
const buildPhoneSchema = (t: Translate) =>
  z
    .string()
    .transform((value) => value.replace(/\s/g, ''))
    .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), {
      message: t('auth.errors.phoneRequired'),
    });

/**
 * El alta de usuario: nombre, correo y contraseña, y una sola casilla. La
 * edad, el género, a quién quiere ver y el plan de la noche los pide la ficha
 * de fiester@ al entrar (`complete-profile-dialog.tsx`); el invitado no los
 * necesita. Quien entra con Google o Apple no pasa por aquí.
 */
const buildUserRegisterSchema = (t: Translate) =>
  z.object({
    name: z.string().trim().min(2, { message: t('auth.errors.nameRequired') }).max(60),
    email: z.string().trim().email({ message: t('auth.errors.invalidEmail') }),
    password: z.string().min(8, { message: t('auth.errors.passwordShort') }),
    // Una casilla para las tres cosas (edad, términos y privacidad): se
    // guardan igual, documento a documento, con la misma fecha.
    acceptAll: z.literal(true, { errorMap: () => ({ message: t('auth.errors.acceptAll') }) }),
  });

const buildVenueRegisterSchema = (t: Translate) =>
  z
    .object({
      email: z.string().email({ message: t('auth.errors.invalidEmail') }),
      password: z.string().min(8, { message: t('auth.errors.passwordShort') }),
      confirmPassword: z.string(),
      venueName: z.string().min(1, { message: t('auth.errors.venueNameRequired') }),
      venueType: z.enum([
        'discoteca',
        'bar',
        'local',
        'fiesta_privada',
        'evento_empresarial',
        'festival',
      ]),
      // El identificador fiscal es lo único de este formulario que se puede
      // contrastar contra un registro público, así que se comprueba el dígito
      // de control aquí mismo en vez de aceptar cualquier cadena.
      taxId: z
        .string()
        .transform(normalizeNif)
        .refine(isValidNif, { message: t('auth.errors.taxIdInvalid') }),
      address: z.string().min(8, { message: t('auth.errors.addressRequired') }).max(160),
      phone: buildPhoneSchema(t),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.errors.passwordMismatch'),
      path: ['confirmPassword'],
    });

type UserRegisterValues = z.infer<ReturnType<typeof buildUserRegisterSchema>>;

/**
 * Qué hacer cuando el alta falla.
 *
 * El caso que importa es que la cuenta se haya creado y el correo no haya
 * salido: dejar ahí un mensaje de error haría que esa persona lo intentara otra
 * vez y se encontrara con «ese correo ya está registrado», sin cuenta usable ni
 * forma de saber por qué. Se la lleva a la pantalla de verificación, que tiene
 * el botón de reenviar.
 */
const handleSignUpError = (
  error: unknown,
  email: string,
  ctx: {
    navigate: ReturnType<typeof useNavigate>;
    toast: ReturnType<typeof useToast>['toast'];
    t: Translate;
    /** Marca en rojo el campo que ya está registrado. */
    onTaken?: (campo: 'email' | 'phone') => void;
  },
) => {
  const { navigate, toast, t } = ctx;

  if (error instanceof AuthEmailFailure && (error.code === 'EMAIL_TAKEN' || error.code === 'PHONE_TAKEN')) {
    ctx.onTaken?.(error.code === 'EMAIL_TAKEN' ? 'email' : 'phone');
  }

  if (error instanceof AuthEmailFailure && error.accountCreated) {
    navigate('/auth/verify-email-pending', { state: { email, emailFailed: true } });
    return;
  }

  toast({
    title: t('common.error'),
    description: t(authEmailMessage(error)),
    variant: 'destructive',
  });
};

/**
 * Comprueba al salir del campo si el correo o el móvil ya tienen cuenta y lo
 * marca en rojo: «Este correo ya está registrado» / «Este móvil ya está
 * registrado». Antes se dejaba seguir y llegaba un correo de «ya tienes cuenta».
 */
const useTakenCheck = <T extends FieldValues>(form: UseFormReturn<T>, t: Translate) =>
  useCallback(
    async (campo: 'email' | 'phone') => {
      const valores = form.getValues() as unknown as { email?: string; phone?: string };
      const email = (valores.email ?? '').trim();
      const phone = valores.phone ?? '';
      if (campo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
      if (campo === 'phone' && phone.replace(/\D/g, '').length < 7) return;

      const r = await authEmailService.checkAvailability(campo === 'email' ? email : '', campo === 'phone' ? phone : undefined);
      const ocupado = campo === 'email' ? r.emailTaken : r.phoneTaken;
      if (ocupado) {
        form.setError(campo as Path<T>, {
          type: 'taken',
          message: t(campo === 'email' ? 'auth.errors.emailTaken' : 'auth.errors.phoneTaken'),
        });
      }
    },
    [form, t],
  );

const legalLinkProps = {
  className: 'font-semibold text-white underline decoration-party-primary decoration-2 underline-offset-4',
  target: '_blank' as const,
  rel: 'noopener noreferrer',
};

/**
 * Una casilla de consentimiento con su texto y su enlace al documento.
 *
 * Se marca cada documento por separado, y no con una casilla única de «acepto
 * todo», porque el consentimiento se guarda documento a documento y hay que
 * poder demostrar cuál se aceptó y en qué versión.
 */
const ConsentField: React.FC<{
  control: Control<UserRegisterValues>;
  name: 'acceptAll';
  id: string;
  i18nKey: string;
  components?: Record<string, React.ReactElement>;
}> = ({ control, name, id, i18nKey, components }) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem className="space-y-1">
        <div className="flex items-start gap-3">
          <FormControl>
            <Checkbox
              id={id}
              checked={Boolean(field.value)}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              className="mt-0.5 shrink-0"
            />
          </FormControl>
          <label htmlFor={id} className="cursor-pointer text-body-sm leading-snug text-[#E4E1E6]">
            <Trans i18nKey={i18nKey} components={components} />
          </label>
        </div>
        <FormMessage />
      </FormItem>
    )}
  />
);

// ============================================================================
// Login de usuario
// ============================================================================

const UserLoginForm = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { refreshSession } = useAppContext();
  const onError = useValidationToast();
  const [isLoading, setIsLoading] = useState(false);

  const schema = useMemo(() => buildLoginSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      });

      if (error) {
        toast({
          title: t('common.error'),
          description: authErrorMessage(error.message, t),
          variant: 'destructive',
        });
        return;
      }

      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        navigate('/auth/verify-email-pending', { state: { email: values.email } });
        return;
      }

      // Se espera a que el contexto sepa quién ha entrado antes de navegar.
      //
      // Sin esta espera había que meter las credenciales dos veces: se navegaba
      // a /home mientras el contexto todavía tenía `userType = null`, la guarda
      // de rutas lo leía como «sin sesión» y devolvía al formulario. A la
      // segunda ya estaba cargado y entraba.
      await refreshSession();

      // El destino depende del rol real del perfil, no del email.
      const profile = await api.getCurrentProfile();
      if (!profile) {
        const venue = await api.getCurrentVenue();
        navigate(venue ? '/venue/dashboard' : '/home', { replace: true });
        return;
      }

      // En app.vybes.es este formulario es el acceso de administración: una
      // cuenta de clubber no tiene aquí nada que usar y se le indica la app.
      if (siteMode() === 'app' && profile.role !== 'admin') {
        // Alguien del equipo de un local que ha entrado por aquí: a su panel.
        if (await api.getMyVenueMembership()) {
          navigate('/venue/dashboard', { replace: true });
          return;
        }
        await supabase.auth.signOut();
        const state: { motivo: DownloadReason } = { motivo: 'clubber' };
        navigate(DOWNLOAD_PATH, { replace: true, state });
        return;
      }

      navigate(profile.role === 'admin' ? '/admin/dashboard' : '/home', { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.email')}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="tu@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.password')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <PartyButton size="lg" className="w-full" type="submit" disabled={isLoading}>
          {isLoading ? t('auth.loggingIn') : t('auth.login')}
        </PartyButton>
        <div className="text-center">
          <ForgotPassword defaultEmail={form.getValues('email')} />
        </div>
      </form>
    </Form>
  );
};

// ============================================================================
// Registro de usuario
// ============================================================================

const UserRegisterForm = ({ kind }: { kind: AccountKind }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const onError = useValidationToast();
  const [isLoading, setIsLoading] = useState(false);

  const schema = useMemo(() => buildUserRegisterSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', acceptAll: false as unknown as true },
  });

  const comprobarOcupado = useTakenCheck(form, t);

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setIsLoading(true);
    track('signup_started', { type: kind === 'guest' ? 'guest' : 'user' });

    try {
      // El perfil lo crea el trigger handle_new_user() a partir de estos
      // metadatos. Insertarlo desde el cliente fallaba porque todavía no hay
      // sesión y la policy exige auth.uid() = user_id.
      await authEmailService.signUp({
        email: values.email,
        password: values.password,
        metadata: {
          account_type: 'user',
          name: values.name,
          profile_kind: kind,
          // Queda anotado en la cuenta para que la pantalla de consentimiento
          // no vuelva a preguntar lo que ya se aceptó aquí, y lo registre en
          // la base de datos en cuanto haya sesión.
          consent_accepted_at: new Date().toISOString(),
        },
      });

      track('signup_completed', { type: 'user' });
      navigate('/auth/verify-email-pending', { state: { email: values.email } });
    } catch (error) {
      handleSignUpError(error, values.email, {
        navigate,
        toast,
        t,
        onTaken: (campo) => void comprobarOcupado(campo),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.name')}</FormLabel>
              <FormControl>
                <Input autoComplete="given-name" placeholder={t('auth.namePlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.email')}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" placeholder="tu@email.com"
                  {...field}
                  onBlur={() => {
                    field.onBlur();
                    void comprobarOcupado('email');
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.password')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormDescription>{t('auth.passwordHelp')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="pt-1">
          <ConsentField
            control={form.control}
            name="acceptAll"
            id="accept-all"
            i18nKey="consent.all"
            components={{
              terms: <Link to="/legal/terminos" {...legalLinkProps} />,
              privacy: <Link to="/legal/privacidad" {...legalLinkProps} />,
            }}
          />
        </div>

        <PartyButton size="lg" className="w-full" type="submit" disabled={isLoading}>
          {isLoading ? t('auth.registering') : t('auth.register')}
        </PartyButton>
      </form>
    </Form>
  );
};

// ============================================================================
// Login de local
// ============================================================================

const VenueLoginForm = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { refreshSession } = useAppContext();
  const onError = useValidationToast();
  const [isLoading, setIsLoading] = useState(false);

  const schema = useMemo(() => buildLoginSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      });

      if (error) {
        toast({
          title: t('common.error'),
          description: authErrorMessage(error.message, t),
          variant: 'destructive',
        });
        return;
      }

      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        navigate('/auth/verify-email-pending', { state: { email: values.email, type: 'venue' } });
        return;
      }

      // Igual que en el acceso de usuario: primero el contexto, después navegar.
      await refreshSession();

      // La cuenta del local o, en app.vybes.es, alguien de su equipo (personal,
      // marketing) con su propia cuenta de Vybe.
      const venue = await api.getCurrentVenue();
      const equipo = !venue && siteMode() === 'app' ? await api.getMyVenueMembership() : null;
      if (!venue && !equipo) {
        await supabase.auth.signOut();
        toast({ title: t('auth.errors.notVenueAccount'), variant: 'destructive' });
        return;
      }

      navigate('/venue/dashboard', { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.venueEmail')}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="contacto@tuempresa.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.password')}</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <PartyButton size="lg" className="w-full" type="submit" disabled={isLoading}>
          {isLoading ? t('auth.loggingIn') : t('auth.loginAsVenue')}
        </PartyButton>
        <div className="text-center">
          <ForgotPassword defaultEmail={form.getValues('email')} />
        </div>
      </form>
    </Form>
  );
};

// ============================================================================
// Registro de local
// ============================================================================

const VenueRegisterForm = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const onError = useValidationToast();

  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [documents, setDocuments] = useState<File[]>([]);

  const schema = useMemo(() => buildVenueRegisterSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      venueName: '',
      taxId: '',
      address: '',
      phone: '+34',
      venueType: 'bar',
    },
  });

  const nextStep = async (fields: (keyof z.infer<typeof schema>)[]) => {
    if (await form.trigger(fields)) setStep((prev) => prev + 1);
  };

  /**
   * Añade ficheros a los ya elegidos en lugar de reemplazarlos.
   *
   * El selector se abre una vez por fichero en muchos móviles, así que
   * sustituir la lista en cada apertura hacía imposible subir dos cosas.
   * Se descarta lo que pase de 5 MB aquí y no al enviar, para no descubrirlo
   * después de rellenar todo el formulario.
   */
  const addDocuments = (files: File[]) => {
    const tooBig = files.filter((f) => f.size > MAX_DOCUMENT_BYTES);
    if (tooBig.length > 0) {
      toast({
        title: t('auth.errors.fileTooBig'),
        description: tooBig.map((f) => f.name).join(', '),
        variant: 'destructive',
      });
    }

    const accepted = files.filter((f) => f.size <= MAX_DOCUMENT_BYTES);

    setDocuments((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}`));
      return [...prev, ...accepted.filter((f) => !seen.has(`${f.name}-${f.size}`))];
    });
  };

  const removeDocument = (file: File) =>
    setDocuments((prev) => prev.filter((f) => !(f.name === file.name && f.size === file.size)));

  const comprobarOcupado = useTakenCheck(form, t);

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setIsLoading(true);
    track('signup_started', { type: 'venue' });

    try {
      // Los documentos se suben con URLs firmadas que devuelve la propia
      // función. Antes se intentaban subir sólo `if (data.session)`, y con la
      // confirmación de correo activada nunca hay sesión en este punto: no se
      // subía ni uno, y administración veía todos los locales sin documentación
      // sin que nadie entendiera por qué.
      await authEmailService.signUp({
        email: values.email.trim(),
        password: values.password,
        documents,
        metadata: {
          account_type: 'venue',
          venue_name: values.venueName,
          venue_type: values.venueType,
          phone: values.phone,
          tax_id: values.taxId,
          address: values.address,
        },
      });

      track('signup_completed', { type: 'venue' });

      navigate('/auth/verify-email-pending', {
        replace: true,
        state: { email: values.email, type: 'venue' },
      });
    } catch (error) {
      handleSignUpError(error, values.email, {
        navigate,
        toast,
        t,
        onTaken: (campo) => void comprobarOcupado(campo),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onError)} className="space-y-4">
        <div className="flex items-center justify-center mb-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex items-center">
              {n > 1 && (
                <div className={`h-1 w-10 ${step >= n ? 'bg-party-primary' : 'bg-muted'}`} />
              )}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  step >= n ? 'bg-party-primary text-party-dark' : 'bg-muted text-party-gray'
                }`}
              >
                {n}
              </div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.venueEmail')}</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="contacto@tuempresa.com"
                  {...field}
                  onBlur={() => {
                    field.onBlur();
                    void comprobarOcupado('email');
                  }}
                />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.password')}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.repeatPassword')}</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <PartyButton
              className="w-full"
              type="button"
              onClick={() => void nextStep(['email', 'password', 'confirmPassword'])}
            >
              {t('common.continue')}
            </PartyButton>
          </>
        )}

        {step === 2 && (
          <>
            <FormField
              control={form.control}
              name="venueName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.venueName')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('auth.venueNamePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="venueType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.venueType')}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VENUE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`venueTypes.${type}`)} · {VENUE_RADIUS[type]} m
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{t('auth.venueTypeHelp')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taxId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.taxId')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="B12345678"
                      autoComplete="off"
                      className="uppercase"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t('auth.taxIdHelp')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.venueAddress')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('auth.venueAddressPlaceholder')}
                      autoComplete="street-address"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t('auth.venueAddressHelp')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.phone')}</FormLabel>
                  <FormControl>
                    <PhoneInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={() => {
                        field.onBlur();
                        void comprobarOcupado('phone');
                      }}
                      id="venue-phone"
                    />
                  </FormControl>
                  <FormDescription>{t('auth.venuePhoneHelp')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <PartyButton
                variant="outline"
                className="w-1/2"
                type="button"
                onClick={() => setStep(1)}
              >
                {t('common.back')}
              </PartyButton>
              <PartyButton
                className="w-1/2"
                type="button"
                onClick={() =>
                  void nextStep(['venueName', 'venueType', 'taxId', 'address', 'phone'])
                }
              >
                {t('common.next')}
              </PartyButton>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-2">
              <span className="text-sm font-medium">{t('auth.documents')}</span>

              <div className="rounded-lg border-2 border-dashed border-border bg-card p-5 text-center">
                <p className="text-sm text-party-gray mb-4">{t('auth.documentsHelp')}</p>

                {/* `value` no se pasa al input: un input de tipo file es siempre
                    no controlado y React rechaza un FileList como valor. */}
                <input
                  id="venue-documents"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    addDocuments(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />

                {/* El disparador es el `label`, no un `button`: dentro de un
                    formulario un botón enviaría el formulario al pulsarlo. Se
                    le da la forma del resto de botones porque el problema era
                    precisamente ese, que parecía una etiqueta gris y nadie
                    entendía que se pudiera pulsar. */}
                <PartyButton asChild variant="outline" className="cursor-pointer">
                  <label htmlFor="venue-documents">
                    <Upload size={16} className="mr-2" />
                    {t('auth.selectFiles')}
                  </label>
                </PartyButton>

                {documents.length > 0 && (
                  <ul className="mt-4 space-y-1 text-left">
                    {documents.map((file) => (
                      <li
                        key={`${file.name}-${file.size}`}
                        className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-xs"
                      >
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          className="press shrink-0 text-destructive"
                          onClick={() => removeDocument(file)}
                          aria-label={t('common.delete')}
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-xs text-party-gray mt-3">{t('auth.maxFileSize')}</p>
              </div>

              {documents.length === 0 && (
                <p className="text-xs text-party-gray">{t('auth.documentsRequired')}</p>
              )}
            </div>

            <div className="flex gap-2">
              <PartyButton
                variant="outline"
                className="w-1/2"
                type="button"
                onClick={() => setStep(2)}
              >
                {t('common.back')}
              </PartyButton>
              <PartyButton
                variant="gradient"
                className="w-1/2"
                type="submit"
                disabled={isLoading || documents.length === 0}
              >
                {isLoading ? t('auth.registering') : t('auth.finishRegistration')}
              </PartyButton>
            </div>
          </>
        )}
      </form>
    </Form>
  );
};

// ============================================================================
// Página
// ============================================================================

const AuthPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [kind, setKind] = useState<AccountKind>('vyber');
  const [info, setInfo] = useState<AccountKind | null>(null);
  const { t } = useTranslation();

  // `type` identifica la cuenta y `mode` el formulario. Antes ambos leían el
  // mismo parámetro, así que /auth?type=register no renderizaba nada.
  const [authMode, setAuthMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login',
  );

  // En app.vybes.es la web es de locales y administración: sólo se registran
  // locales, y el acceso «de usuario» es el de administración (los admins son
  // perfiles con rol). Los clubbers se registran desde la app del móvil.
  const soloEmpresas = siteMode() === 'app';
  const accountType =
    searchParams.get('type') === 'venue' || (soloEmpresas && authMode === 'register') ? 'venue' : 'user';

  useEffect(() => {
    setAuthMode(searchParams.get('mode') === 'register' ? 'register' : 'login');
  }, [searchParams]);

  const toggleMode = () => {
    const next = authMode === 'login' ? 'register' : 'login';
    setAuthMode(next);
    setSearchParams({ type: soloEmpresas ? 'venue' : accountType, mode: next }, { replace: true });
  };

  const backClass = 'press flex h-10 w-10 items-center justify-center rounded-full bg-card text-foreground';

  const renderForm = () => {
    if (accountType === 'venue') {
      return authMode === 'login' ? <VenueLoginForm /> : <VenueRegisterForm />;
    }
    if (authMode === 'login') {
      return (
        <div className="space-y-4">
          {!soloEmpresas && <SocialLoginButtons />}
          {!soloEmpresas && PHONE_SIGNUP && <PhoneAuthForm />}
          <UserLoginForm />
        </div>
      );
    }

    // Dos formas de estar en Vybe, y se eligen aquí: no es lo mismo venir a
    // conocer gente que venir a enterarte de dónde se sale.
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-card p-1">
          {(['vyber', 'guest'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              aria-pressed={kind === option}
              className={`press h-11 rounded-lg text-sm font-bold ${
                kind === option ? 'bg-party-primary text-ink' : 'text-party-gray hover:text-foreground'
              }`}
            >
              {t(`accountKind.${option}.tab`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setInfo(kind)}
          className="press flex w-full items-center gap-2 rounded-xl bg-card p-3 text-left"
        >
          <Info size={18} className="shrink-0 text-party-primary" />
          <span className="min-w-0 flex-1 text-body-sm text-party-gray">
            {t(`accountKind.${kind}.infoCta`)}
          </span>
        </button>

        <SocialLoginButtons kind={kind} />
        {PHONE_SIGNUP && <PhoneAuthForm kind={kind} />}
        <UserRegisterForm kind={kind} />

        <AccountKindInfo kind={info} onClose={() => setInfo(null)} />
      </div>
    );
  };

  // «Crea tu cuenta» de Stitch: flecha sola arriba a la izquierda, la bandera
  // del idioma a la derecha, el título alineado a la izquierda y los campos
  // directamente sobre el lienzo, sin tarjeta alrededor.
  return (
    <div className="pt-safe min-h-screen">
      <div className="mx-auto w-full max-w-md px-margin pb-10 pt-4">
        <div className="flex items-center justify-between">
          {/* Sólo la flecha: el nombre sigue estando para quien use lector de
              pantalla. */}
          {soloEmpresas ? (
            <a href={landingHref('/')} aria-label={t('auth.backHome')} className={backClass}>
              <ArrowLeft size={20} />
            </a>
          ) : (
            <Link to="/" aria-label={t('auth.backHome')} className={backClass}>
              <ArrowLeft size={20} />
            </Link>
          )}
          <LanguageSwitcher />
        </div>

        <div className="mb-6 mt-6 flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-label-pill uppercase tracking-wider text-party-primary">
              {accountType === 'user' ? <UserIcon size={14} /> : <Building size={14} />}
              {t(accountType === 'venue' ? 'auth.venueAccess' : soloEmpresas ? 'auth.adminAccess' : 'auth.userAccess')}
            </p>
            <h1 className="mt-1 font-display text-headline-xl">
              {t(authMode === 'login' ? 'auth.loginTitle' : 'auth.registerTitle')}
            </h1>
            <p className="mt-1 text-body-md text-party-gray">
              {t(authMode === 'login' ? 'auth.loginSubtitle' : 'auth.registerSubtitle')}
            </p>
          </div>
          <VybeMark size={44} className="mt-1" />
        </div>

        <div key={`${accountType}-${authMode}`} className="enter">
          {renderForm()}
        </div>

        {/* El acceso de administración no tiene registro. */}
        {!(soloEmpresas && accountType === 'user') && (
          <p className="mt-6 text-center text-body-md text-party-gray">
            {t(authMode === 'login' ? 'auth.noAccount' : 'auth.haveAccount')}{' '}
            <button
              type="button"
              onClick={toggleMode}
              className="press font-bold text-party-primary hover:underline"
            >
              {t(authMode === 'login' ? 'auth.toRegisterShort' : 'auth.toLoginShort')}
            </button>
          </p>
        )}

        {soloEmpresas && authMode === 'login' && (
          <p className="mt-4 text-center text-caption font-normal text-party-gray">
            <button
              type="button"
              onClick={() => setSearchParams({ type: accountType === 'venue' ? 'user' : 'venue', mode: 'login' }, { replace: true })}
              className="press underline underline-offset-2 hover:text-foreground"
            >
              {t(accountType === 'venue' ? 'auth.toAdminAccess' : 'auth.toVenueAccess')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
