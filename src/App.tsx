import { Suspense, lazy, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppProvider } from '@/context/app-context';
import { PremiumProvider } from '@/context/premium-context';
import ProtectedRoute from '@/components/protected-route';
import PremiumFeatures from '@/components/premium-features';
import PwaPrompt from '@/components/pwa-prompt';
import ConsentGate from '@/components/consent-gate';
import ErrorBoundary from '@/components/error-boundary';
import { isNative, setupDeepLinks } from '@/services/native';
import DevSentryCheck from '@/components/dev-sentry-check';
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
// El mapa arrastra Leaflet (unos 150 KB con sus estilos): sólo se descarga al abrirlo.
const MapPage = lazy(() => import('./pages/MapPage'));
const TicketsPage = lazy(() => import('./pages/TicketsPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const EventSwipingPage = lazy(() => import('./pages/EventSwipingPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));

/**
 * `/` es la landing en el navegador y la bienvenida dentro de la app instalada
 * (Capacitor o la web añadida a la pantalla de inicio): quien ya tiene la app
 * no necesita que se la vendan.
 */
const RootPage = () => {
  const installed =
    isNative() ||
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches);
  return installed ? <Index /> : <LandingPage />;
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
            <DevSentryCheck />
            <DeepLinks />

            <Suspense fallback={<PantallaCargando />}>
              <ConsentGate>
                <Routes>
                  {/* Públicas */}
                  <Route path="/" element={<RootPage />} />
                  <Route path="/bienvenida" element={<Index />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
                  <Route path="/auth/verify-email-pending" element={<VerifyEmailPage />} />
                  <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/legal/:document" element={<LegalPage />} />

                  {/* Usuarios */}
                  <Route path="/home" element={guarded(<HomePage />, { allow: ['user', 'admin'] })} />
                  <Route
                    path="/location"
                    element={guarded(<LocationPage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/map"
                    element={guarded(<MapPage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/tickets"
                    element={guarded(<TicketsPage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/matches"
                    element={guarded(<MatchesPage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/likes"
                    element={guarded(<LikesPage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/u/:userId"
                    element={guarded(<UserProfilePage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/chat/:userId"
                    element={guarded(<ChatPage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/profile"
                    element={guarded(<ProfilePage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/event/:eventId"
                    element={guarded(<EventDetailPage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/event/:eventId/access"
                    element={guarded(<EventAccessPage />, { allow: ['user', 'admin'] })}
                  />
                  <Route
                    path="/event/:eventId/live"
                    element={guarded(<EventSwipingPage />, {
                      allow: ['user', 'admin'],
                      requireEvent: true,
                    })}
                  />

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
              </ConsentGate>
            </Suspense>
          </PremiumProvider>
        </AppProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
