import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/app-context';
import { DOWNLOAD_PATH, DownloadReason, siteMode } from '@/lib/hosts';

/**
 * Pantallas por las que una cuenta de clubber sí puede pasar en la web: los
 * enlaces de los correos. Al confirmar el email o cambiar la contraseña la sesión
 * es de esa cuenta, y echarla antes de terminar dejaría el trámite a medias.
 */
const TRAMITES = ['/auth/verify-email', '/auth/verify-email-pending', '/auth/reset-password'];

/**
 * En `app.vybes.es` sólo entran administración y locales.
 *
 * Vybe se usa dentro del local, desde la app del móvil: la web no tiene
 * interfaz de clubber. Si una cuenta normal acaba con sesión aquí —porque
 * probó el acceso de administración o porque ya la tenía abierta—, se cierra y
 * se le manda a la página de descarga, que explica dónde entrar.
 */
const StaffOnlyWeb = () => {
  const { isLoading, isLoggedIn, userType, logout } = useAppContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const clubberConSesion =
    siteMode() === 'app' && !isLoading && isLoggedIn && userType === 'user' && !TRAMITES.includes(pathname);

  useEffect(() => {
    if (!clubberConSesion) return;

    void logout().then(() => {
      const state: { motivo: DownloadReason } = { motivo: 'clubber' };
      navigate(DOWNLOAD_PATH, { replace: true, state });
    });
  }, [clubberConSesion, logout, navigate]);

  return null;
};

export default StaffOnlyWeb;
