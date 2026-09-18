import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '@/context/app-context';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { isNative } from '@/services/native';
import {
  autoRegisterNativePush,
  initNativePush,
  setNativePushHandlers,
  wasMatchCelebrated,
} from '@/services/native-push';

/**
 * Une los avisos del teléfono con la app.
 *
 * - Al tocar un aviso se abre su pantalla (la conversación, la lista de vybes o
 *   la puerta del evento), también si la app estaba cerrada.
 * - Si llega con la app delante, Android no lo enseña: sale como un aviso de la
 *   propia app, salvo que ya estés en esa pantalla (en el chat con esa persona
 *   el mensaje ya aparece solo).
 * - Con sesión de clubber, registra el teléfono y la primera vez pide permiso.
 *
 * Vive dentro del router porque necesita `useNavigate`.
 */
const NativePushBridge = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentUser, userType } = useAppContext();

  // Los manejadores se ponen una sola vez y leen lo último de aquí: si se
  // quitaran y pusieran en cada navegación, un toque podría caer en el hueco.
  const latest = useRef({ navigate, pathname, t, toast });
  latest.current = { navigate, pathname, t, toast };

  useEffect(() => {
    if (!isNative()) return;

    setNativePushHandlers({
      onOpen: (url) => latest.current.navigate(url),
      onForeground: ({ title, body, url, tag }) => {
        const actual = latest.current;
        if (url && actual.pathname === url) return;
        if (tag?.startsWith('match-') && wasMatchCelebrated(tag.slice('match-'.length))) return;

        actual.toast({
          title,
          description: body,
          action: url ? (
            <ToastAction altText={actual.t('common.open')} onClick={() => actual.navigate(url)}>
              {actual.t('common.open')}
            </ToastAction>
          ) : undefined,
        });
      },
    });

    void initNativePush();
  }, []);

  const profileId = currentUser?.id;
  const clubber = userType === 'user' || userType === 'admin';

  useEffect(() => {
    if (!isNative() || !profileId || !clubber) return;
    void autoRegisterNativePush();
  }, [profileId, clubber]);

  return null;
};

export default NativePushBridge;
