import { useTranslation } from 'react-i18next';
import { Apple, Play } from 'lucide-react';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/hosts';
import { cn } from '@/lib/utils';

/**
 * Botones de Google Play y App Store.
 *
 * Mientras la app no está publicada (`VITE_PLAY_STORE_URL` y
 * `VITE_APP_STORE_URL` vacías) salen desactivados con «Próximamente», en vez de
 * llevar a una página que no existe.
 */
const StoreButtons = ({ className, tone = 'dark' }: { className?: string; tone?: 'dark' | 'ink' }) => {
  const { t } = useTranslation();

  const stores = [
    { key: 'play', url: PLAY_STORE_URL, icon: Play, label: t('landing.download.googlePlay') },
    { key: 'apple', url: APP_STORE_URL, icon: Apple, label: t('landing.download.appStore') },
  ];

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row', className)}>
      {stores.map(({ key, url, icon: Icon, label }) => {
        const inner = (
          <>
            <Icon size={20} className="shrink-0" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {url ? t('landing.download.getIt') : t('landing.download.soon')}
              </span>
              <span className="font-display text-title-card">{label}</span>
            </span>
          </>
        );
        const base = cn(
          'flex h-14 min-w-[190px] items-center justify-center gap-3 rounded-xl px-5',
          tone === 'ink' ? 'bg-ink text-white' : 'bg-surface-high text-foreground',
        );

        return url ? (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer" className={cn(base, 'press hover:opacity-90')}>
            {inner}
          </a>
        ) : (
          <span key={key} aria-disabled="true" className={cn(base, 'cursor-default opacity-60')}>
            {inner}
          </span>
        );
      })}
    </div>
  );
};

export default StoreButtons;
