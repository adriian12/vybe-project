import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';

/** Una foto que no ha pasado la revisión: su posición (desde 1) y el motivo. */
export interface FailedPhoto {
  index: number;
  reason?: string;
}

interface PhotoRequirementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Las que no han pasado. Vacío = no se muestra nada. */
  failed: FailedPhoto[];
  /** Cuántas se revisaban a la vez: con una sola no se numera. */
  total: number;
  /** `event`: la foto de esta noche, que además tiene que ser de la cámara. */
  kind?: 'profile' | 'event';
}

const MOTIVOS = ['no_face', 'many_faces', 'nudity', 'weapon', 'offensive', 'gore', 'unavailable'];

/**
 * «La imagen 2 no cumple los requisitos», con la lista de requisitos.
 *
 * La revisión es automática y contesta al momento, así que el aviso también:
 * se dice qué foto ha fallado y por qué, para repetir sólo esa.
 */
const PhotoRequirementsDialog = ({ open, onOpenChange, failed, total, kind = 'profile' }: PhotoRequirementsDialogProps) => {
  const { t } = useTranslation();
  const soloNoDisponible = failed.length > 0 && failed.every((f) => f.reason === 'unavailable');

  // «1, 2 y 3»
  const numeros = failed.map((f) => String(f.index));
  const lista =
    numeros.length > 1 ? `${numeros.slice(0, -1).join(', ')} ${t('photoCheck.and')} ${numeros[numeros.length - 1]}` : numeros[0] ?? '';

  const titulo = soloNoDisponible
    ? t('photoCheck.unavailableTitle')
    : total <= 1
      ? t('photoCheck.titleSingle')
      : failed.length >= total
        ? t('photoCheck.titleAll')
        : t('photoCheck.titleSome', { count: failed.length, list: lista });

  const requisitos = ['face', 'oneFace', 'nudity', 'violence', 'offensive', ...(kind === 'event' ? ['cameraNow'] : [])];

  return (
    <Dialog open={open && failed.length > 0} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="text-left">
          <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
            <AlertTriangle size={24} />
          </span>
          <DialogTitle className="font-display text-headline-md">{titulo}</DialogTitle>
          {soloNoDisponible && <DialogDescription>{t('photoCheck.unavailableBody')}</DialogDescription>}
        </DialogHeader>

        {!soloNoDisponible && (
          <ul className="space-y-1 text-body-sm">
            {failed.map((f) => (
              <li key={f.index} className="font-semibold text-destructive">
                {total > 1 ? `${t('photoCheck.image', { n: f.index })}: ` : ''}
                {t(`photoCheck.reasons.${f.reason && MOTIVOS.includes(f.reason) ? f.reason : 'generic'}`)}
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-2xl bg-surface-low p-4">
          <p className="mb-2 text-caption font-bold uppercase tracking-wide text-party-gray">
            {t('photoCheck.requirementsTitle')}
          </p>
          <ul className="space-y-1.5 text-body-sm">
            {requisitos.map((key) => (
              <li key={key} className="flex items-start gap-2">
                <Check size={15} className="mt-0.5 shrink-0 text-party-primary" />
                {t(`photoCheck.requirements.${key}`)}
              </li>
            ))}
          </ul>
        </div>

        <PartyButton className="w-full" onClick={() => onOpenChange(false)}>
          {total > 1 && failed.length > 1 ? t('photoCheck.retakeMany') : t('photoCheck.retakeOne')}
        </PartyButton>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoRequirementsDialog;
