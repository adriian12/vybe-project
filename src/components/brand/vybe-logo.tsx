import { cn } from '@/lib/utils';

interface VybeMarkProps {
  className?: string;
  /** Lado en píxeles. */
  size?: number;
}

/**
 * El símbolo de Vybe: una V amarilla con un punto encima, sobre un cuadrado
 * oscuro redondeado.
 *
 * Es el logotipo del proyecto de Stitch dibujado en SVG y no una imagen: pesa
 * doscientos bytes, se ve nítido a cualquier tamaño y no hay que esperar a que
 * cargue para pintar la cabecera.
 */
export const VybeMark: React.FC<VybeMarkProps> = ({ className, size = 32 }) => (
  <svg
    viewBox="0 0 100 100"
    width={size}
    height={size}
    className={cn('shrink-0', className)}
    aria-hidden="true"
  >
    <rect width="100" height="100" rx="24" fill="#1C1C1C" />
    <path d="M28 28 L50 72 L72 28 L60 28 L50 52 L40 28 Z" fill="#F8D000" />
    <circle cx="50" cy="22" r="4" fill="#F8D000" />
  </svg>
);

/** Símbolo y nombre juntos, como en la cabecera de las pantallas. */
export const VybeLogo: React.FC<{ className?: string; size?: number }> = ({
  className,
  size = 32,
}) => (
  <span className={cn('flex items-center gap-2', className)}>
    <VybeMark size={size} />
    <span className="font-display text-headline-lg uppercase tracking-tight text-foreground">
      Vybes
    </span>
  </span>
);
