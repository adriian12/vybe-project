import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/app-context';
import InAppNotice, { type InAppNoticeData } from '@/components/in-app-notice';
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
 * - Si llega con la app delante, el sistema no lo enseña: sale arriba el aviso
 *   de la propia app (`InAppNotice`), salvo que ya estés en esa pantalla (en
 *   el chat con esa persona el mensaje ya aparece solo).
 * - Con sesión de clubber, registra el teléfono y la primera vez pide permiso.
 *
 * Vive dentro del router porque necesita `useNavigate`.
 */
const NativePushBridge = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [aviso, setAviso] = useState<(InAppNoticeData & { id: number }) | null>(null);
  const { currentUser, userType } = useAppContext();

  // Los manejadores se ponen una sola vez y leen lo último de aquí: si se
  // quitaran y pusieran en cada navegación, un toque podría caer en el hueco.
  const latest = useRef({ navigate, pathname });
  latest.current = { navigate, pathname };

  useEffect(() => {
    if (!isNative()) return;

    setNativePushHandlers({
      onOpen: (url) => latest.current.navigate(url),
      onForeground: (push) => {
        const actual = latest.current;
        if (push.url && actual.pathname === push.url) return;
        if (push.tag?.startsWith('match-') && wasMatchCelebrated(push.tag.slice('match-'.length))) return;
        setAviso({ ...push, id: Date.now() });
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

  return <InAppNotice notice={aviso} onOpen={(url) => navigate(url)} onClose={(id) => setAviso((a) => (a?.id === id ? null : a))} />;
};

export default NativePushBridge;
