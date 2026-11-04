import { Suspense, lazy, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';

// La hoja sólo se carga al pulsar.
const GoHomeSheet = lazy(() => import('./go-home-sheet'));

interface Props {
  eventId?: string | null;
  venueName?: string | null;
  /** `card` va debajo de la tarjeta amarilla; `outline`, en fondos oscuros. */
  tone?: 'card' | 'outline';
  className?: string;
}

/** El botón «Volver a casa» con su hoja. */
const GoHomeButton: React.FC<Props> = ({ eventId, venueName, tone = 'outline', className }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [cargada, setCargada] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCargada(true);
          setOpen(true);
        }}
        className={cn(
          'press flex h-11 w-full items-center justify-center gap-2 rounded-xl font-bold',
          tone === 'card' ? 'bg-surface-container text-foreground hover:bg-surface-high' : 'border border-white/15 text-white',
          className,
        )}
      >
        <Home size={17} />
        {t('goHome.button')}
      </button>
      {cargada && (
        <Suspense fallback={null}>
          <GoHomeSheet open={open} onOpenChange={setOpen} eventId={eventId} venueName={venueName} />
        </Suspense>
      )}
    </>
  );
};

export default GoHomeButton;
