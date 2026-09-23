import { cn } from '@/lib/utils';

export interface PanelTab {
  id: string;
  label: string;
  /** Número en una píldora (códigos activos, promos, etc.). */
  count?: number;
}

interface PanelTabsProps {
  tabs: PanelTab[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Pestañas del panel del local.
 *
 * Puerta y Promociones se habían quedado en dos páginas larguísimas en las que
 * había que bajar mucho para llegar a lo de siempre. Con pestañas, cada cosa
 * está a un toque y en el móvil caben deslizando de lado.
 */
const PanelTabs = ({ tabs, value, onChange, className }: PanelTabsProps) => (
  <div role="tablist" className={cn('no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1', className)}>
    {tabs.map((tab) => {
      const activa = tab.id === value;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activa}
          onClick={() => onChange(tab.id)}
          className={cn(
            'press flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-label-pill tracking-wide transition-colors',
            activa ? 'bg-party-primary text-ink shadow-sm' : 'bg-surface-low text-foreground',
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span
              className={cn(
                'flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold',
                activa ? 'bg-ink text-party-primary' : 'bg-white/10 text-foreground',
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

export default PanelTabs;
