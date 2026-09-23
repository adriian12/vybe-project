import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppContext, UserType } from '@/context/app-context';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Tipos de cuenta autorizados. Si se omite, basta con estar autenticado. */
  allow?: UserType[];
  /** Exige haber canjeado el código de un evento en curso. */
  requireEvent?: boolean;
}

const FullScreenLoader = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4">
    <div className="w-10 h-10 border-4 border-party-primary border-t-transparent rounded-full animate-spin" />
    <p className="text-party-gray text-sm">Cargando…</p>
  </div>
);

/**
 * Guarda de rutas.
 *
 * Antes todas las rutas eran públicas: /venue/dashboard y /admin/dashboard se
 * podían abrir escribiendo la URL. Algunas páginas hacían su propia redirección
 * dentro de un useEffect, que se ejecuta después de pintar y no protege nada.
 */
const ProtectedRoute = ({ children, allow, requireEvent = false }: ProtectedRouteProps) => {
  const { isLoading, isLoggedIn, userType, activeEvent, currentUser } = useAppContext();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;

  if (!isLoggedIn || !userType) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  // La cuenta de sólo administración no tiene parte de clubber: cualquier
  // pantalla de fiesta la devuelve al panel.
  if (currentUser?.staffOnly && !location.pathname.startsWith('/admin')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (allow && !allow.includes(userType)) {
    // Cada tipo de cuenta vuelve a su propia zona en vez de ver un 403 vacío.
    const fallback = userType === 'venue' ? '/venue/dashboard' : '/home';
    return <Navigate to={fallback} replace />;
  }

  if (requireEvent && !activeEvent) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
