import { Suspense, lazy, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '@/context/app-context';
import { accountHasSeen, deviceSeenAt, deviceSeenRecently, markAccountSeen } from '@/lib/welcome-tour';

const WelcomeTour = lazy(() => import('./welcome-tour'));

/** Donde no se abre: formularios a medias, enlaces del equipo y textos legales. */
const FUERA = ['/auth', '/admin', '/legal', '/contador', '/equipo', '/compra-hecha', '/tickets/buy'];

/**
 * Enseña el tutorial a quien entra con su cuenta por primera vez (registro
 * nuevo o primer inicio de sesión). Espera a que haya completado el perfil para
 * no salir encima de ese diálogo. Ver `lib/welcome-tour.ts`.
 */
const WelcomeTourGate = () => {
  const { isLoading, isLoggedIn, userType, currentUser } = useAppContext();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const userId = currentUser?.id ?? null;
  const toca =
    !isLoading &&
    isLoggedIn &&
    userType === 'user' &&
    Boolean(userId) &&
    !currentUser?.staffOnly &&
    currentUser?.profileCompleted !== false &&
    !FUERA.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!toca) return;
    let cancelado = false;
    void (async () => {
      if (await accountHasSeen()) return;
      if (deviceSeenRecently(deviceSeenAt())) {
        // Lo acaba de ver en la bienvenida, antes de registrarse.
        await markAccountSeen();
        return;
      }
      if (!cancelado) setOpen(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [toca, userId]);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <WelcomeTour
        loggedIn
        onClose={() => {
          setOpen(false);
          void markAccountSeen();
        }}
      />
    </Suspense>
  );
};

export default WelcomeTourGate;
