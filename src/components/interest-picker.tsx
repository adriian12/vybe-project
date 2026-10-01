import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { socialService, Interest } from '@/services/social';

interface InterestPickerProps {
  /** Ids seleccionados. */
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
}

/** Etiqueta legible de un interés a partir de su slug. */
export const useInterestLabel = () => {
  const { t } = useTranslation();
  return (slug: string) => t(`interests.${slug}`, { defaultValue: slug.replace(/_/g, ' ') });
};

/**
 * Selector de intereses.
 *
 * Hasta ahora el único criterio de emparejamiento era la proximidad, que es un
 * filtro, no un algoritmo.
 */
const InterestPicker: React.FC<InterestPickerProps> = ({ value, onChange, max = 8 }) => {
  const { t } = useTranslation();
  const label = useInterestLabel();

  const [interests, setInterests] = useState<Interest[]>([]);

  useEffect(() => {
    void socialService.getInterests().then(setInterests);
  }, []);

  const byCategory = useMemo(() => {
    return interests.reduce<Record<string, Interest[]>>((acc, interest) => {
      (acc[interest.category] ??= []).push(interest);
      return acc;
    }, {});
  }, [interests]);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
      return;
    }
    if (value.length >= max) return;
    onChange([...value, id]);
  };

  if (interests.length === 0) return null;

  return (
    <div className="space-y-4">
      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category}>
          <p className="text-xs uppercase tracking-wide text-party-gray mb-2">
            {t(`interests.categories.${category}`, { defaultValue: category })}
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map((interest) => {
              const selected = value.includes(interest.id);
              const disabled = !selected && value.length >= max;

              return (
                <button
                  key={interest.id}
                  type="button"
                  onClick={() => toggle(interest.id)}
                  disabled={disabled}
                  aria-pressed={selected}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors flex items-center gap-1 ${
                    selected
                      ? 'bg-party-primary text-party-dark border-party-primary'
                      : 'border-border text-party-gray hover:border-party-primary'
                  } ${disabled ? 'opacity-40' : ''}`}
                >
                  {selected && <Check size={12} />}
                  {label(interest.slug)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-xs text-party-gray">
        {value.length}/{max}
      </p>
    </div>
  );
};

export default InterestPicker;
