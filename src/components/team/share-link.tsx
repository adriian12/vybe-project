import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, MessageCircle } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';

/**
 * QR, texto, copiar y WhatsApp: los enlaces del equipo y el código de cada
 * RRPP se comparten igual.
 */
const ShareLink = ({ value, shown, whatsappText }: { value: string; shown?: string; whatsappText: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t('team.share.copied') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="mx-auto w-fit rounded-xl bg-white p-2 leading-none">
        <QRCodeSVG value={value} size={160} level="M" />
      </div>
      <p className="break-all rounded-lg bg-black/[0.05] px-2 py-1.5 text-center font-mono text-[12px] text-ink">
        {shown ?? value}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <PartyButton size="sm" variant="outline" className="gap-1.5" onClick={() => void copiar()}>
          <Copy size={15} />
          {t('team.share.copy')}
        </PartyButton>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
          target="_blank"
          rel="noreferrer"
          className="press flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-body-sm font-bold text-white"
        >
          <MessageCircle size={15} />
          WhatsApp
        </a>
      </div>
    </div>
  );
};

export default ShareLink;
