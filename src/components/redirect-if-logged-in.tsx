import { ReactNode, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAppContext, UserType } from '@/context/app-context';

/** Pantalla de inicio de cada tipo de cuenta. */
// eslint-disable-next-line react-refresh/only-export-components
export const homeFor = (userType: UserType): string =>
  userType === 'venue' ? '/venue/dashboard' : userType === 'admin' ? '/admin/dashboard' : '/home';

/**
 * Para la bienvenida y el login: si al abrirlos ya había sesión, se va directo a
 * la pantalla de esa cuenta.
 *
 * Sin esto, al cerrar y volver a abrir la app se veía «Continuar como usuario»
 * aunque la sesión siguiera viva, y parecía que se había cerrado.
 *
 * La decisión se toma una sola vez, con la primera respuesta de la sesión: si
 * alguien inicia sesión desde el propio formulario, navega el formulario (que
 * sabe, por ejemplo, echar a una cuenta que no es de local del acceso de
 * locales) y esto no se mete en medio.
 */
const RedirectIfLoggedIn = ({ children }: { children: ReactNode }) => {
  const { isLoading, isLoggedIn, userType } = useAppContext();
  const yaHabiaSesion = useRef<boolean | null>(null);

  if (yaHabiaSesion.current === null && !isLoading) {
    yaHabiaSesion.current = isLoggedIn;
  }

  if (yaHabiaSesion.current === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-party-primary" />
      </div>
    );
  }

  if (yaHabiaSesion.current && isLoggedIn && userType) {
    return <Navigate to={homeFor(userType)} replace />;
  }

  return <>{children}</>;
};

export default RedirectIfLoggedIn;
