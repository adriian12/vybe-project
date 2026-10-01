import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { cn } from '@/lib/utils';

/** Las dos formas de estar en Vybe. */
export type AccountKind = 'vyber' | 'guest';

/**
 * Qué tiene cada cuenta: [invitado, vyber]. Primero lo que comparten, después
 * lo que sólo tiene Vyber, para que la diferencia se lea de un vistazo.
 */
const FILAS: [string, boolean, boolean][] = [
  ['events', true, true],
  ['tickets', true, true],
  ['follow', true, true],
  ['qr', true, true],
  ['offers', true, true],
  ['raffles', false, true],
  ['challenges', false, true],
  ['songs', false, true],
  ['vibe', false, true],
  ['board', false, true],
  ['premium', false, true],
];

const Si = () => (
  <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
    <Check size={15} strokeWidth={3} />
  </span>
);

const No = () => (
  <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-red-500">
    <X size={15} strokeWidth={3} />
  </span>
);

/**
 * «Como invitado ves la fiesta; como Vyber la juegas»: tabla de lo que tiene
 * cada tipo de cuenta, con la columna de `kind` resaltada.
 */
const AccountKindInfo = ({ kind, onClose }: { kind: AccountKind | null; onClose: () => void }) => {
  const { t } = useTranslation();

  const columna = (activa: boolean) =>
    cn('w-[4.5rem] text-center', activa && 'bg-party-primary/10');

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {kind && (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-headline-md leading-tight">
                {t('accountKind.compare.title')}
              </DialogTitle>
              <DialogDescription>{t(`accountKind.${kind}.infoBody`)}</DialogDescription>
            </DialogHeader>

            <div className="overflow-hidden rounded-2xl bg-surface-low">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-caption font-bold uppercase tracking-wide">
                    <th className="px-3 py-2.5 text-left text-party-gray" />
                    <th className={cn(columna(kind === 'guest'), 'py-2.5', kind === 'guest' ? 'text-party-primary' : 'text-party-gray')}>
                      {t('accountKind.compare.guest')}
                    </th>
                    <th className={cn(columna(kind === 'vyber'), 'py-2.5', kind === 'vyber' ? 'text-party-primary' : 'text-party-gray')}>
                      {t('accountKind.compare.vyber')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FILAS.map(([clave, invitado, vyber]) => (
                    <tr key={clave} className="border-t border-white/[0.06]">
                      <td className="px-3 py-2">{t(`accountKind.compare.rows.${clave}`)}</td>
                      <td className={cn(columna(kind === 'guest'), 'py-2')}>{invitado ? <Si /> : <No />}</td>
                      <td className={cn(columna(kind === 'vyber'), 'py-2')}>{vyber ? <Si /> : <No />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-caption text-party-gray">{t('accountKind.switchNote')}</p>

            <PartyButton className="w-full" onClick={onClose}>
              {t('common.close')}
            </PartyButton>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AccountKindInfo;
