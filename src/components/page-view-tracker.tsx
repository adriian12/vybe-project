import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from '@/lib/observability';

/**
 * Cuenta las visitas de cada pantalla con la analítica propia
 * (`analytics-collect`): sin cookies, sin terceros y sin guardar nada en el
 * dispositivo, por eso no necesita aviso de cookies.
 */
const PageViewTracker = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    track('page_view', { path: pathname, host: window.location.hostname });
  }, [pathname]);
  return null;
};

export default PageViewTracker;
