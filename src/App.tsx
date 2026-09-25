import { Suspense, lazy, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Routes, Route, useNavigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppProvider } from '@/context/app-context';
import { PremiumProvider } from '@/context/premium-context';
import ProtectedRoute from '@/components/protected-route';
import PremiumFeatures from '@/components/premium-features';
import SupercrushDialog from '@/components/supercrush-dialog';
import PwaPrompt from '@/components/pwa-prompt';
import ConsentGate from '@/components/consent-gate';
import ErrorBoundary from '@/components/error-boundary';
import { isNative, setupDeepLinks } from '@/services/native';
import { APP_URL, DOWNLOAD_PATH, siteMode } from '@/lib/hosts';
import DevSentryCheck from '@/components/dev-sentry-check';
import RedirectIfLoggedIn from '@/components/redirect-if-logged-in';
import NativePushBridge from '@/components/native-push-bridge';
import StaffOnlyWeb from '@/components/staff-only-web';
import WhereNextPrompt from '@/components/where-next-prompt';
import Index from './pages/Index';
import NotFound from './pages/NotFound';
import AuthPage from './pages/AuthPage';
import LocationPage from './pages/LocationPage';
import HomePage from './pages/HomePage';
import MatchesPage from './pages/MatchesPage';
import LikesPage from './pages/LikesPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import CompleteProfileDialog from '@/components/complete-profile-dialog';

/**
 * Pantallas que se cargan cuando hacen falta.
 *
 * Todo iba en un solo fichero de 860 KB, así que abrir la portada en un
 * móvil con datos descargaba también el panel del local, el de
 * administración, el lector de QR y las gráficas. Ninguna de esas pantallas
 * la ve la mayoría de la gente, y las dos primeras no las ve casi nadie.
 */
const LegalPage = lazy(() => import('./pages/LegalPage'));
const VenueDashboardPage = lazy(() => import('./pages/venue/VenueDashboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const EventAccessPage = lazy(() => import('./pages/EventAccessPage'));
const EventDetailPage = lazy(() => import('./pages/EventDetailPage'));
const VenuePage = lazy(() => import('./pages/VenuePage'));
// El mapa arrastra Leaflet (unos 150 KB con sus estilos): sólo se descarga al abrirlo.
const MapPage = lazy(() => import('./pages/MapPage'));
const TicketsPage = lazy(() => import('./pages/TicketsPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const EventSwipingPage = lazy(() => import('./pages/EventSwipingPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const MobileOnlyPage = lazy(() => import('./pages/MobileOnlyPage'));
// El contador del portero: se abre sin cuenta, desde el enlace que crea el local.
const CounterPage = lazy(() => import('./pages/CounterPage'));
// Seguridad, Camareros y RRPP: sin cuenta, desde el enlace que crea el local.
const TeamLinkPage = lazy(() => import('./pages/TeamLinkPage'));

/**
 * `/` es la landing en el navegador y la bienvenida dentro de la app instalada
 * (Capacitor o la web añadida a la pantalla de inicio): quien ya tiene la app
 * no necesita que se la vendan.
 */
const RootPage = () => {
  if (MODE === 'app') return <Navigate to="/auth?type=venue" replace />;
  const installed =
    isNative() ||
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches);
  return installed ? (
    <RedirectIfLoggedIn>
      <Index />
    </RedirectIfLoggedIn>
  ) : (
    <LandingPage />
  );
};

/** Qué parte de Vybe sirve este dominio (`src/lib/hosts.ts`). No cambia sin recargar. */
const MODE = siteMode();

/**
 * En `vybes.es` sólo viven la landing y los textos legales: cualquier otra ruta
 * (un enlace viejo, el de un correo) se abre en `app.vybes.es` tal cual.
 */
const GoToApp = () => {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    window.location.replace(`${APP_URL}${pathname}${search}${hash}`);
  }, []);
  return <PantallaCargando />;
};

/** Lo que se ve mientras llega una pantalla. */
const PantallaCargando = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-party-primary" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** Envuelve una ruta protegida en su propio límite de error. */
const guarded = (
  element: React.ReactNode,
  options: { allow?: ('user' | 'venue' | 'admin')[]; requireEvent?: boolean } = {},
) => (
  <ProtectedRoute allow={options.allow} requireEvent={options.requireEvent}>
    <ErrorBoundary area="route">{element}</ErrorBoundary>
  </ProtectedRoute>
);

/**
 * Pantalla de clubber. En `app.vybes.es` no se abre: la web es para locales y
 * administración, y quien sale de fiesta usa la app del móvil.
 */
const clubber = (element: React.ReactNode, options: { requireEvent?: boolean } = {}) =>
  MODE === 'app' ? <MobileOnlyPage /> : guarded(element, { allow: ['user', 'admin'], ...options });

/**
 * Escucha los enlaces que abren la aplicación instalada y navega a su pantalla.
 *
 * Vive dentro del router porque necesita `useNavigate`: cambiar
 * `window.location` recargaría la aplicación entera y perdería la sesión en
 * memoria, que es justo lo contrario de lo que se busca al abrir un enlace.
 */
const DeepLinks = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let limpiar: (() => void) | undefined;

    void setupDeepLinks((path) => navigate(path)).then((quitar) => {
      limpiar = quitar;
    });

    return () => limpiar?.();
  }, [navigate]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AppProvider>
          <PremiumProvider>
            <Toaster />
            <Sonner />
            <PwaPrompt />
            <PremiumFeatures />
            <CompleteProfileDialog />
            <SupercrushDialog />
            <DevSentryCheck />
            <DeepLinks />
            <NativePushBridge />
            <StaffOnlyWeb />
            <WhereNextPrompt />

            <Suspense fallback={<PantallaCargando />}>
              <ConsentGate>
                {MODE === 'landing' ? (
                  <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/legal" element={<LegalPage />} />
                    <Route path="/legal/:document" element={<LegalPage />} />
                    <Route path="*" element={<GoToApp />} />
                  </Routes>
                ) : (
                  <Routes>
                    {/* Públicas */}
                    <Route path="/" element={<RootPage />} />
                    <Route
                      path="/bienvenida"
                      element={
                        MODE === 'app' ? (
                          <Navigate to="/auth?type=venue" replace />
                        ) : (
                          <RedirectIfLoggedIn>
                            <Index />
                          </RedirectIfLoggedIn>
                        )
                      }
                    />
                    <Route
                      path="/auth"
                      element={
                        <RedirectIfLoggedIn>
                          <AuthPage />
                        </RedirectIfLoggedIn>
                      }
                    />
                    {/* Acceso de administración: app.fiestea.es/admin. Es el
                        mismo formulario de cuenta normal, pero con su propia
                        dirección para no tener que recordar parámetros. */}
                    <Route
                      path="/admin"
                      element={
                        <RedirectIfLoggedIn>
                          <AuthPage />
                        </RedirectIfLoggedIn>
                      }
                    />
                    <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
                    <Route path="/auth/verify-email-pending" element={<VerifyEmailPage />} />
                    <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/legal" element={<LegalPage />} />
                    <Route path="/legal/:document" element={<LegalPage />} />
                    <Route path={DOWNLOAD_PATH} element={<MobileOnlyPage />} />
                    <Route path="/contador/:token" element={<CounterPage />} />
                    <Route path="/equipo/:token" element={<TeamLinkPage />} />

                    {/* Clubbers */}
                    <Route path="/home" element={clubber(<HomePage />)} />
                    <Route path="/location" element={clubber(<LocationPage />)} />
                    <Route path="/map" element={clubber(<MapPage />)} />
                    <Route path="/tickets" element={clubber(<TicketsPage />)} />
                    <Route path="/matches" element={clubber(<MatchesPage />)} />
                    <Route path="/likes" element={clubber(<LikesPage />)} />
                    <Route path="/u/:userId" element={clubber(<UserProfilePage />)} />
                    <Route path="/local/:venueId" element={clubber(<VenuePage />)} />
                    <Route path="/chat/:userId" element={clubber(<ChatPage />)} />
                    <Route path="/profile" element={clubber(<ProfilePage />)} />
                    <Route path="/event/:eventId" element={clubber(<EventDetailPage />)} />
                    <Route path="/event/:eventId/access" element={clubber(<EventAccessPage />)} />
                    <Route path="/event/:eventId/live" element={clubber(<EventSwipingPage />, { requireEvent: true })} />

                    {/* Locales */}
                    <Route
                      path="/venue/dashboard"
                      element={guarded(<VenueDashboardPage />, { allow: ['venue'] })}
                    />

                    {/* Administración */}
                    <Route
                      path="/admin/dashboard"
                      element={guarded(<AdminDashboardPage />, { allow: ['admin'] })}
                    />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                )}
              </ConsentGate>
            </Suspense>
          </PremiumProvider>
        </AppProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
