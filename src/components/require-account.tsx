import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Bookmark, ClipboardList, Gift, Heart, MessageCircle, PartyPopper, Sparkles, Ticket, User, UserPlus, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import Footer from '@/components/footer';
import { VybeMark } from '@/components/brand/vybe-logo';
import { AccountReason, onAccountRequested } from '@/lib/explorer';

const ICONOS: Record<AccountReason, LucideIcon> = {
  follow: Heart,
  tickets: Ticket,
  enter: PartyPopper,
  crushes: Sparkles,
  chat: MessageCircle,
  profile: User,
  notifications: Bell,
  raffle: Sparkles,
  save: Bookmark,
  offer: Gift,
  list: ClipboardList,
  generic: UserPlus,
};

/** Para qué pantalla hace falta la cuenta, por su ruta. */
const motivoDeRuta = (path: string): AccountReason => {
  if (/^\/(matches|likes)/.test(path)) return 'crushes';
  if (/^\/(chat|u\/)/.test(path)) return 'chat';
  if (/^\/tickets/.test(path)) return 'tickets';
  if (/^\/profile/.test(path)) return 'profile';
  if (/^\/event\/[^/]+\/(access|live)/.test(path)) return 'enter';
  return 'generic';
};

/** El texto y los botones, iguales en el aviso y en la pantalla. */
const Contenido = ({ reason, onGo, dialog = false }: { reason: AccountReason; onGo: () => void; dialog?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const Icono = ICONOS[reason];
  const ir = (destino: string) => {
    onGo();
    navigate(destino);
  };

  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-party-primary/15 text-party-primary">
        <Icono size={28} />
      </span>
      {dialog ? (
        <DialogTitle className="mt-4 font-display text-headline-md">{t(`explorer.reasons.${reason}`)}</DialogTitle>
      ) : (
        <h2 className="mt-4 font-display text-headline-md">{t(`explorer.reasons.${reason}`)}</h2>
      )}
      <p className="mt-2 text-body-md text-party-gray">{t('explorer.body')}</p>
      <div className="mt-6 w-full space-y-2">
        <button
          type="button"
          onClick={() => ir('/auth?type=user&mode=register')}
          className="press flex h-12 w-full items-center justify-center rounded-xl bg-party-primary font-display text-title-card text-ink"
        >
          {t('explorer.create')}
        </button>
        <button
          type="button"
          onClick={() => ir('/auth?type=user')}
          className="press h-11 w-full rounded-xl text-body-md font-bold text-foreground"
        >
          {t('explorer.login')}
        </button>
      </div>
    </div>
  );
};

/**
 * El aviso «Crea tu cuenta para…» de quien mira sin cuenta. Lo abre
 * `needsAccount()` desde cualquier botón; va montado una vez en `App.tsx`.
 */
export const RequireAccountSheet = () => {
  const { t } = useTranslation();
  const [reason, setReason] = useState<AccountReason | null>(null);

  useEffect(() => onAccountRequested(setReason), []);

  return (
    <Dialog open={reason !== null} onOpenChange={(abierto) => !abierto && setReason(null)}>
      <DialogContent className="z-[1000] max-w-sm rounded-2xl">
        <DialogDescription className="sr-only">{t('explorer.body')}</DialogDescription>
        {reason && <Contenido reason={reason} onGo={() => setReason(null)} dialog />}
        <button
          type="button"
          onClick={() => setReason(null)}
          className="press -mt-1 h-10 w-full text-body-sm text-party-gray"
        >
          {t('explorer.keepBrowsing')}
        </button>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Lo que ve quien mira sin cuenta al abrir una pantalla que la necesita
 * (Crushes, Entradas, Perfil, entrar en una fiesta…), con la barra de abajo
 * para volver a las fiestas.
 */
export const AccountWall = () => {
  const location = useLocation();
  return (
    <div className="pt-safe flex min-h-[100dvh] flex-col pb-[calc(var(--nav-h,72px)+env(safe-area-inset-bottom))]">
      <div className="flex justify-center pt-6">
        <VybeMark size={40} />
      </div>
      <div className="enter mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-margin">
        <Contenido reason={motivoDeRuta(location.pathname)} onGo={() => undefined} />
      </div>
      <Footer />
    </div>
  );
};
