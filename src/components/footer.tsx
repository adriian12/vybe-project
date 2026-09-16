import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, Martini, Ticket, User, Zap } from 'lucide-react';
import { useAppContext } from '@/context/app-context';

const items = [
  { to: '/home', icon: Martini, key: 'nav.home', also: /^\/(home|event|location)/ },
  { to: '/map', icon: Compass, key: 'nav.map', also: /^\/map/ },
  { to: '/tickets', icon: Ticket, key: 'nav.tickets', also: /^\/tickets/ },
  { to: '/matches', icon: Zap, key: 'nav.vybes', also: /^\/(matches|likes|chat|u\/)/ },
  { to: '/profile', icon: User, key: 'nav.profile', also: /^\/profile/ },
] as const;

/**
 * La barra de abajo del diseño de Stitch: cinco destinos sobre #1F1F22, y el
 * activo con el icono oscuro dentro de un círculo amarillo y el nombre en
 * amarillo.
 *
 * Stitch dibuja una pestaña «Buscar» que aquí no está: la búsqueda vive en la
 * cabecera del mapa, que es donde el mismo diseño pone el buscador, y su hueco
 * lo ocupa «Vybes» (conexiones y a quién le gustas), como en la pantalla del
 * match. Sin ella, lo que da sentido a la aplicación quedaba a dos toques.
 */
const Footer = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { messages, currentUser } = useAppContext();

  // Un punto en «Vybes» cuando hay mensajes sin leer: es la única pestaña que
  // cambia sin que tú hagas nada.
  const pendientes = useMemo(() => {
    if (!currentUser) return 0;
    return Object.values(messages).reduce(
      (total, lista) =>
        total + lista.filter((m) => m.receiverId === currentUser.id && !m.read).length,
      0,
    );
  }, [messages, currentUser]);

  return (
    <nav className="pb-safe fixed bottom-0 left-0 right-0 z-30 bg-surface-container/95 shadow-[0_-2px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-around px-1">
        {items.map(({ to, icon: Icon, key, also }) => {
          const activo = also.test(pathname);

          return (
            <NavLink
              key={to}
              to={to}
              aria-current={activo ? 'page' : undefined}
              className="press flex min-h-[44px] w-16 flex-col items-center justify-center"
            >
              <span
                className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200 ${
                  activo ? 'bg-party-primary text-ink' : 'text-party-gray'
                }`}
              >
                <Icon size={19} strokeWidth={activo ? 2.4 : 2} />
                {to === '/matches' && pendientes > 0 && !activo && (
                  <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-party-primary ring-2 ring-surface-container" />
                )}
              </span>
              <span
                className={`mt-0.5 w-full truncate text-center text-caption ${
                  activo ? 'font-bold text-party-primary' : 'text-party-gray'
                }`}
              >
                {t(key)}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default Footer;
