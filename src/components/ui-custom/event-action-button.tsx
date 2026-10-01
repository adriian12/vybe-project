import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Estilo compartido de las acciones que hay dentro de un evento: filtros,
 * grupos, ofertas, ayuda y salir.
 *
 * Son píldoras oscuras con icono y nombre, como las fichas de filtro de Stitch:
 * en una pista de baile, de noche y con el móvil en una mano, un icono suelto
 * no se acierta, y una etiqueta al lado dice qué hace sin tener que probarlo.
 *
 * Se exporta la clase además del componente porque los paneles laterales traen
 * su propio disparador y necesitan el mismo aspecto.
 */
export const eventActionClass =
  'press relative flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full ' +
  'bg-card px-3.5 text-label-pill text-foreground transition-colors hover:bg-surface-high ' +
  '[&_svg]:size-4 [&_svg]:text-party-primary';

interface EventActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Para «salir», que conviene distinguir del resto. */
  tone?: 'default' | 'danger' | 'active';
  disabled?: boolean;
}

export const EventActionButton = ({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
  disabled,
}: EventActionButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      eventActionClass,
      'disabled:opacity-60',
      tone === 'danger' && 'text-destructive [&_svg]:text-destructive',
      tone === 'active' && 'bg-party-primary text-ink [&_svg]:text-ink hover:bg-party-primary',
    )}
    aria-label={label}
  >
    <Icon />
    <span className="whitespace-nowrap">{label}</span>
  </button>
);

export default EventActionButton;
