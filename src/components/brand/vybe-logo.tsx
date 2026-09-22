import { cn } from '@/lib/utils';

interface VybeMarkProps {
  className?: string;
  /** Lado en píxeles. */
  size?: number;
}

/**
 * El símbolo de Fiestea: una F amarilla inclinada con un destello, sobre un
 * cuadrado oscuro redondeado.
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
    <path d="M35.8 26 L73.8 26 L71.9 38 L47.9 38 L46.6 46 L62.6 46 L60.9 57 L44.9 57 L41.8 76 L27.8 76 Z" fill="#F8D000" />
    <path d="M73 56 L76.2 66.8 L87 70 L76.2 73.2 L73 84 L69.8 73.2 L59 70 L69.8 66.8 Z" fill="#F8D000" />
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
      Fiestea
    </span>
  </span>
);
