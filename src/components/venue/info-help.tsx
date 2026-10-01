import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface InfoHelpProps {
  /** Clave dentro de `venue.help`: title, body y steps. */
  topic: string;
  className?: string;
}

/**
 * El «¿qué es esto?» de cada sección del panel.
 *
 * Un local que entra por primera vez no tiene por qué saber qué es un vale, un
 * reto o la lista de quien dice que va. En vez de llenar la pantalla de texto,
 * cada sección lleva este interrogante al lado del título y explica, en dos
 * frases y un par de pasos, para qué sirve y cuándo se usa.
 */
const InfoHelp = ({ topic, className }: InfoHelpProps) => {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);

  // Los pasos son opcionales: `returnObjects` da la lista si existe.
  const pasos = t(`venue.help.${topic}.steps`, { returnObjects: true, defaultValue: [] }) as string[];

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(true);
        }}
        aria-label={t('venue.help.open')}
        className={cn('press flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-party-gray', className)}
      >
        <HelpCircle size={16} />
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="cards-light max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>{t(`venue.help.${topic}.title`)}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{t(`venue.help.${topic}.body`)}</DialogDescription>
          </DialogHeader>

          {Array.isArray(pasos) && pasos.length > 0 && (
            <ol className="space-y-2 pb-2">
              {pasos.map((paso, i) => (
                <li key={paso} className="flex gap-2.5 text-body-sm">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-party-primary text-caption font-bold text-ink">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{paso}</span>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default InfoHelp;
