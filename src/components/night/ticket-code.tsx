import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

/**
 * El código de un vale para enseñar en la barra (el mismo que valida el local
 * en «Validar un vale»). También sale con su QR en «Entradas».
 */
const TicketCode = ({ code, used }: { code: string; used?: boolean }) => {
  const { t } = useTranslation();

  return (
    <div className={`mt-3 rounded-lg p-3 text-center ${used ? 'bg-muted' : 'bg-party-primary/10'}`}>
      {used ? (
        <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <X size={14} />
          {t('offers.used')}
        </p>
      ) : (
        <>
          <p className="mb-1 text-xs text-muted-foreground">{t('offers.showThis')}</p>
          <p className="font-mono text-2xl font-bold tracking-[0.2em] text-party-primary">{code}</p>
        </>
      )}
    </div>
  );
};

export default TicketCode;
