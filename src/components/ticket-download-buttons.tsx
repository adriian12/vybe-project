import { useTranslation } from 'react-i18next';
import { Download, Wallet } from 'lucide-react';
import { isNative, openExternal, platform } from '@/services/native';
import { ticketDownloadUrl } from '@/services/tickets';
import { cn } from '@/lib/utils';

/**
 * Descargar el PDF de las entradas y añadirlas a Apple Wallet.
 *
 * Los ficheros los sirve `ticket-download` con el token del pedido, así que se
 * abren fuera de la app: el navegador del sistema descarga el PDF y, en un
 * iPhone, Safari enseña «Añadir a Wallet» al abrir el `.pkpass`.
 */

/** Apple Wallet sólo existe en iPhone, iPad y Mac. */
export const canUseAppleWallet = (): boolean =>
  isNative() ? platform() === 'ios' : /iPhone|iPad|Macintosh/.test(navigator.userAgent);

const abrir = (url: string) => void openExternal(url, { system: true });

interface Props {
  token: string;
  /** Una entrada concreta; sin él, el PDF lleva todas las del pedido. */
  code?: string;
  /** Códigos para los botones de Wallet (uno por entrada). */
  walletCodes?: string[];
  /** `light` sobre tarjeta blanca; `dark` sobre el fondo de la app. */
  tone?: 'light' | 'dark';
  className?: string;
}

const TicketDownloadButtons = ({ token, code, walletCodes, tone = 'dark', className }: Props) => {
  const { t } = useTranslation();
  const codigos = walletCodes ?? (code ? [code] : []);
  const wallet = canUseAppleWallet() && codigos.length > 0;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <button
        type="button"
        onClick={() => abrir(ticketDownloadUrl(token, code))}
        className={cn(
          'press flex h-11 items-center justify-center gap-2 rounded-xl px-4 font-bold',
          tone === 'light' ? 'border border-black/15 text-ink' : 'bg-party-primary text-ink',
        )}
      >
        <Download size={16} />
        {code || codigos.length === 1 ? t('tickets.download.pdfOne') : t('tickets.download.pdfAll')}
      </button>
      {wallet &&
        codigos.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => abrir(ticketDownloadUrl(token, c, 'pkpass'))}
            className="press flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 font-bold text-white ring-1 ring-white/15"
          >
            <Wallet size={16} />
            {codigos.length > 1 ? t('tickets.download.walletCode', { code: c }) : t('tickets.download.wallet')}
          </button>
        ))}
    </div>
  );
};

export default TicketDownloadButtons;
