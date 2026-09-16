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
import { socialService, Interest, DiscoveryFilters } from '@/services/social';
import { useInterestLabel } from '@/components/interest-picker';
import { usePremium } from '@/context/premium-context';
import { eventActionClass } from '@/components/ui-custom/event-action-button';

interface DiscoveryFiltersSheetProps {
  filters: DiscoveryFilters;
  onApply: (filters: DiscoveryFilters) => void;
}

const AGE_MIN = 18;
const AGE_MAX = 65;

const countActive = (filters: DiscoveryFilters): number =>
  (filters.minAge && filters.minAge > AGE_MIN ? 1 : 0) +
  (filters.maxAge && filters.maxAge < AGE_MAX ? 1 : 0) +
  (filters.interestSlugs?.length ? 1 : 0);

/** Filtros avanzados de descubrimiento. Es una función Premium. */
const DiscoveryFiltersSheet: React.FC<DiscoveryFiltersSheetProps> = ({ filters, onApply }) => {
  const { t } = useTranslation();
  const label = useInterestLabel();
  const { isPremium, setShowPremiumDialog } = usePremium();

  const [open, setOpen] = useState(false);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [ageRange, setAgeRange] = useState<[number, number]>([
    filters.minAge ?? AGE_MIN,
    filters.maxAge ?? AGE_MAX,
  ]);
  const [slugs, setSlugs] = useState<string[]>(filters.interestSlugs ?? []);

  useEffect(() => {
    if (open) void socialService.getInterests().then(setInterests);
  }, [open]);

  const active = countActive(filters);

  const apply = () => {
    onApply({
      minAge: ageRange[0] > AGE_MIN ? ageRange[0] : undefined,
      maxAge: ageRange[1] < AGE_MAX ? ageRange[1] : undefined,
      interestSlugs: slugs.length ? slugs : undefined,
    });
    setOpen(false);
  };

  const reset = () => {
    setAgeRange([AGE_MIN, AGE_MAX]);
    setSlugs([]);
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
          <SheetDescription>
            {isPremium ? t('filters.interestsHelp') : t('filters.premiumOnly')}
          </SheetDescription>
        </SheetHeader>

        {!isPremium ? (
          <div className="py-8 text-center">
            <Crown size={40} className="mx-auto mb-4 text-party-accent" />
            <PartyButton
              variant="gradient"
              onClick={() => {
                setOpen(false);
                setShowPremiumDialog(true);
              }}
            >
              {t('likes.unlock')}
            </PartyButton>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label>
                {t('filters.ageRange')}: {ageRange[0]} – {ageRange[1]}
              </Label>
              <Slider
                min={AGE_MIN}
                max={AGE_MAX}
                step={1}
                value={ageRange}
                onValueChange={(value) => setAgeRange([value[0], value[1]])}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('filters.interests')}</Label>
              <div className="flex flex-wrap gap-2">
                {interests.map((interest) => {
                  const selected = slugs.includes(interest.slug);
                  return (
                    <button
                      key={interest.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setSlugs((prev) =>
                          selected
                            ? prev.filter((s) => s !== interest.slug)
                            : [...prev, interest.slug],
                        )
                      }
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        selected
                          ? 'bg-party-primary text-party-dark border-party-primary'
                          : 'border-border text-party-gray'
                      }`}
                    >
                      {label(interest.slug)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <PartyButton variant="outline" className="flex-1" onClick={reset}>
                {t('filters.reset')}
              </PartyButton>
              <PartyButton variant="gradient" className="flex-1" onClick={apply}>
                {t('filters.apply')}
              </PartyButton>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default DiscoveryFiltersSheet;
