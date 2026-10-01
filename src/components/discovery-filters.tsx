import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, Crown } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { PartyButton } from '@/components/ui-custom/party-button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { DiscoveryFilters } from '@/services/social';
import { api } from '@/services/api';
import { useAppContext } from '@/context/app-context';
import { usePremium } from '@/context/premium-context';
import { eventActionClass } from '@/components/ui-custom/event-action-button';
import { cn } from '@/lib/utils';

interface DiscoveryFiltersSheetProps {
  filters: DiscoveryFilters;
  onApply: (filters: DiscoveryFilters) => void;
}

type Wants = 'women' | 'men' | 'all';

const AGE_MIN = 18;
const AGE_MAX = 65;

const countActive = (filters: DiscoveryFilters): number =>
  (filters.minAge && filters.minAge > AGE_MIN) || (filters.maxAge && filters.maxAge < AGE_MAX) ? 1 : 0;

/**
 * Filtros del tablón.
 *
 * «Quiero ver» es de todo el mundo: es la preferencia del perfil (`wants`) y la
 * aplica la base de datos. Estaba sólo en la pantalla de perfil y desde el
 * tablón no se veía qué había marcado. El rango de edad, con mínimo y máximo,
 * es de Premium. Los intereses no se ofrecen por ahora: el alta no los pide.
 */
const DiscoveryFiltersSheet: React.FC<DiscoveryFiltersSheetProps> = ({ filters, onApply }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentUser, refreshProfile, loadProfiles } = useAppContext();
  const { isPremium, setShowPremiumDialog } = usePremium();

  const [open, setOpen] = useState(false);
  const [wants, setWants] = useState<Wants>(currentUser?.wants ?? 'all');
  const [ageRange, setAgeRange] = useState<[number, number]>([
    filters.minAge ?? AGE_MIN,
    filters.maxAge ?? AGE_MAX,
  ]);

  useEffect(() => {
    if (open) setWants(currentUser?.wants ?? 'all');
  }, [open, currentUser?.wants]);

  const active = countActive(filters);

  const guardarWants = async (): Promise<boolean> => {
    if (wants === (currentUser?.wants ?? 'all')) return false;
    try {
      await api.updateProfile({ wants });
      await refreshProfile();
      return true;
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
      return false;
    }
  };

  const apply = async () => {
    const cambioWants = await guardarWants();
    const siguientes: DiscoveryFilters = isPremium
      ? {
          minAge: ageRange[0] > AGE_MIN ? ageRange[0] : undefined,
          maxAge: ageRange[1] < AGE_MAX ? ageRange[1] : undefined,
        }
      : {};
    onApply(siguientes);
    // Si sólo cambió «Quiero ver», los filtros son los mismos y el tablón no se
    // recargaría solo.
    if (cambioWants) await loadProfiles();
    setOpen(false);
  };

  const reset = () => {
    setAgeRange([AGE_MIN, AGE_MAX]);
    onApply({});
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={`relative ${eventActionClass}`} aria-label={t('swiping.filters')}>
        <SlidersHorizontal size={20} />
        <span className="whitespace-nowrap">{t('swiping.filters')}</span>
        {active > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px] bg-party-primary text-ink">
            {active}
          </Badge>
        )}
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t('filters.title')}</SheetTitle>
          <SheetDescription>{t('filters.help')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>{t('auth.wants')}</Label>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-low p-1">
              {(['women', 'men', 'all'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setWants(option)}
                  aria-pressed={wants === option}
                  className={cn(
                    'press h-10 rounded-lg text-body-sm font-bold',
                    wants === option ? 'bg-party-primary text-ink' : 'text-party-gray',
                  )}
                >
                  {t(`auth.wantsOptions.${option}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              {t('filters.ageRange')}: {ageRange[0]} – {ageRange[1]}
              {!isPremium && <Crown size={14} className="text-party-accent" />}
            </Label>
            {isPremium ? (
              <Slider
                min={AGE_MIN}
                max={AGE_MAX}
                step={1}
                minStepsBetweenThumbs={1}
                value={ageRange}
                onValueChange={(value) => setAgeRange([value[0], value[1]])}
                aria-label={t('filters.ageRange')}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowPremiumDialog(true);
                }}
                className="press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-surface-highest px-4 py-3 text-body-sm text-party-gray"
              >
                <Crown size={16} className="text-party-accent" />
                {t('filters.premiumOnly')}
              </button>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <PartyButton variant="outline" className="flex-1" onClick={reset}>
              {t('filters.reset')}
            </PartyButton>
            <PartyButton variant="gradient" className="flex-1" onClick={() => void apply()}>
              {t('filters.apply')}
            </PartyButton>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DiscoveryFiltersSheet;
