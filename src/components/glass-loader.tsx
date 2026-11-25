import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * El loader de Fiestea: una copa amarilla que se llena.
 *
 * Los estilos (`.fl-*` y sus animaciones) viven en `index.html`, porque la
 * misma copa se pinta allí antes de que cargue el JavaScript; así el arranque y
 * las cargas siguientes son idénticos y no hay salto entre uno y otras.
 */
export const GlassLoader = ({ className, size = 48 }: { className?: string; size?: number }) => {
  const { t } = useTranslation();
  const clip = `fl-bowl-${useId().replace(/:/g, '')}`;
  return (
    <div role="status" aria-label={t('common.loading')} className={cn('fl', className)}>
      <svg width={size} height={(size * 56) / 48} viewBox="0 0 48 56" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <path d="M6 6H42L24 28Z" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect className="fl-liquid" x="0" y="6" width="48" height="23" />
        </g>
        <path className="fl-glass" d="M6 6H42L24 28ZM24 28V49M15 50H33" />
      </svg>
    </div>
  );
};

/** Pantalla completa con la copa, para el arranque y las pantallas que tardan. */
export const FullScreenLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <GlassLoader />
  </div>
);
