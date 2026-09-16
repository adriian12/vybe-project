import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, User } from 'lucide-react';
import { useAppContext } from '@/context/app-context';
import { VybeLogo } from '@/components/brand/vybe-logo';

/** Qué sección se nombra a la derecha de la cabecera según la ruta. */
const SECCIONES: { match: RegExp; key: string }[] = [
  { match: /^\/home/, key: 'nav.home' },
  { match: /^\/map/, key: 'nav.map' },
  { match: /^\/tickets/, key: 'nav.tickets' },
  { match: /^\/(matches|likes)/, key: 'nav.vybes' },
  { match: /^\/chat/, key: 'nav.chat' },
  { match: /^\/profile/, key: 'nav.profile' },
  { match: /^\/u\//, key: 'nav.vybes' },
  { match: /^\/event\/[^/]+\/access/, key: 'nav.access' },
  { match: /^\/event\/[^/]+\/live/, key: 'nav.live' },
  { match: /^\/event\//, key: 'nav.event' },
  { match: /^\/location/, key: 'nav.home' },
];

interface HeaderProps {
  /** Sustituye el nombre de la sección, si la pantalla necesita otro. */
  section?: string;
}

/**
 * La cabecera de las pantallas de usuario, como en Stitch: el símbolo y el
 * nombre a la izquierda; a la derecha, en amarillo, dónde estás, y tu foto,
 * que lleva al perfil.
 *
 * El selector de idioma vivía aquí y se ha ido al perfil, donde lo pone el
 * diseño: en la cabecera ocupaba el hueco del nombre de la sección, que es lo
 * que de verdad orienta cuando se entra desde una notificación.
 */
const Header: React.FC<HeaderProps> = ({ section }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { userType, currentUser } = useAppContext();

  const clave = SECCIONES.find((s) => s.match.test(pathname))?.key;
  const titulo = section ?? (clave ? t(clave) : '');
  const foto = currentUser?.avatar || currentUser?.photos?.[0];

  return (
    <header className="pt-safe fixed left-0 right-0 top-0 z-30 bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-margin">
        <Link to="/home" aria-label={t('nav.home')} className="press">
          <VybeLogo />
        </Link>

        <div className="flex min-w-0 items-center gap-3">
          {titulo && (
            <span className="truncate font-display text-title-card uppercase tracking-wider text-party-primary">
              {titulo}
            </span>
          )}

          {/* La cuenta de administración no tenía forma de volver a su panel
              en cuanto se movía por la aplicación. Sólo la ve quien tiene el
              rol. */}
          {userType === 'admin' && (
            <Link
              to="/admin/dashboard"
              aria-label={t('admin.title')}
              className="press flex h-9 w-9 items-center justify-center rounded-full bg-card text-party-accent"
            >
              <Shield size={16} />
            </Link>
          )}

          <Link
            to="/profile"
            aria-label={t('profile.title')}
            className="press flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card text-party-gray"
          >
            {foto ? (
              <img src={foto} alt="" className="h-full w-full object-cover" />
            ) : (
              <User size={18} />
            )}
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
