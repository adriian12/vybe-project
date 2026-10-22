import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScanLine } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import TicketValidator from '@/components/venue/ticket-validator';
import type { ValidatedTicket } from '@/services/tickets';

/**
 * «Escanear entrada», fijo abajo en las páginas de la puerta que se abren con
 * enlace (el contador y Control puerta). En la puerta se escanea con prisa: el
 * botón está siempre a mano, se haga lo que se haga en la pantalla, y abre la
 * cámara en una hoja sin perder el recuento.
 *
 * La página tiene que dejar sitio abajo (`pb-28`) para que no tape nada.
 */
const ScanTicketButton = ({ validate }: { validate: (code: string) => Promise<ValidatedTicket> }) => {
  const { t } = useTranslation();
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-background via-background/95 to-transparent px-margin pt-6">
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="press pointer-events-auto mx-auto mb-4 flex h-14 w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-party-primary font-display text-title-card uppercase text-ink shadow-[0_8px_24px_rgba(248,208,0,0.25)]"
        >
          <ScanLine size={22} />
          {t('team.scanTicket')}
        </button>
      </div>

      <Sheet open={abierta} onOpenChange={setAbierta}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
          <SheetHeader className="mb-2">
            <SheetTitle>{t('team.scanTicket')}</SheetTitle>
            <SheetDescription>{t('team.scanTicketBody')}</SheetDescription>
          </SheetHeader>
          {abierta && <TicketValidator validate={validate} />}
        </SheetContent>
      </Sheet>
    </>
  );
};

export default ScanTicketButton;
