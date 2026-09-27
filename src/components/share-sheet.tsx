import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Share2 } from 'lucide-react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { InstagramIcon, WhatsAppIcon } from '@/components/brand-icons';
import {
  copyShareLink,
  ShareData,
  ShareResult,
  shareInstagram,
  shareOrCopy,
  shareWhatsApp,
} from '@/lib/share';

/**
 * Hoja de «Compartir»: WhatsApp, Instagram, copiar el enlace o el resto de
 * apps (la hoja del sistema).
 *
 *   const { share, sheet } = useShareSheet();
 *   <button onClick={() => share({ title, text, url })} />
 *   {sheet}
 */

export const useShareSheet = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [datos, setDatos] = useState<ShareData | null>(null);

  const share = useCallback((data: ShareData) => setDatos(data), []);

  const avisar = (resultado: ShareResult, instagram = false) => {
    if (resultado === 'copied') {
      toast({
        title: t('share.copied'),
        description: instagram ? t('share.instagramHint') : undefined,
      });
    }
    if (resultado === 'failed') toast({ title: t('common.error'), variant: 'destructive' });
  };

  const hacer = async (accion: (d: ShareData) => Promise<ShareResult>, instagram = false) => {
    if (!datos) return;
    const d = datos;
    setDatos(null);
    avisar(await accion(d), instagram);
  };

  const opciones = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: <WhatsAppIcon />,
      className: 'bg-[#25D366] text-white',
      onClick: () => void hacer(shareWhatsApp),
    },
    {
      id: 'instagram',
      label: 'Instagram',
      icon: <InstagramIcon />,
      className: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
      onClick: () => void hacer(shareInstagram, true),
    },
    {
      id: 'copy',
      label: t('share.copy'),
      icon: <Link2 size={24} />,
      className: 'bg-surface-high text-white',
      onClick: () => void hacer(copyShareLink),
    },
    {
      id: 'more',
      label: t('share.more'),
      icon: <Share2 size={24} />,
      className: 'bg-surface-high text-white',
      onClick: () => void hacer(shareOrCopy),
    },
  ];

  const sheet = (
    <Drawer open={Boolean(datos)} onOpenChange={(abierto) => !abierto && setDatos(null)}>
      <DrawerContent className="pb-safe">
        <DrawerHeader>
          <DrawerTitle>{t('share.title')}</DrawerTitle>
          <DrawerDescription className="truncate">{datos?.title}</DrawerDescription>
        </DrawerHeader>
        <div className="grid grid-cols-4 gap-3 px-4 pb-6">
          {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={o.onClick}
              className="press flex flex-col items-center gap-2 text-caption font-bold"
            >
              <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${o.className}`}>{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );

  return { share, sheet };
};
