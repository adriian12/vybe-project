import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Campo de teléfono con prefijo internacional.
 *
 * Escribir «+34» a mano es de las cosas que más registros pierde: la mitad de
 * la gente pone el número sin prefijo, el SMS no sale y no hay forma de saber
 * por qué. Con el prefijo elegido de una lista el número siempre sale en
 * formato internacional.
 *
 * La lista no pretende ser el mundo entero: España primero, y detrás los países
 * de donde viene el turismo de Baleares. Basta un país que falte para bloquear
 * a alguien, así que el orden es «lo probable arriba» y no «lo completo».
 */
export interface Country {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'ES', dial: '+34', flag: '🇪🇸', name: 'España' },
  { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'DE', dial: '+49', flag: '🇩🇪', name: 'Deutschland' },
  { code: 'FR', dial: '+33', flag: '🇫🇷', name: 'France' },
  { code: 'IT', dial: '+39', flag: '🇮🇹', name: 'Italia' },
  { code: 'PT', dial: '+351', flag: '🇵🇹', name: 'Portugal' },
  { code: 'NL', dial: '+31', flag: '🇳🇱', name: 'Nederland' },
  { code: 'BE', dial: '+32', flag: '🇧🇪', name: 'België' },
  { code: 'IE', dial: '+353', flag: '🇮🇪', name: 'Ireland' },
  { code: 'CH', dial: '+41', flag: '🇨🇭', name: 'Schweiz' },
  { code: 'AT', dial: '+43', flag: '🇦🇹', name: 'Österreich' },
  { code: 'SE', dial: '+46', flag: '🇸🇪', name: 'Sverige' },
  { code: 'NO', dial: '+47', flag: '🇳🇴', name: 'Norge' },
  { code: 'DK', dial: '+45', flag: '🇩🇰', name: 'Danmark' },
  { code: 'FI', dial: '+358', flag: '🇫🇮', name: 'Suomi' },
  { code: 'PL', dial: '+48', flag: '🇵🇱', name: 'Polska' },
  { code: 'CZ', dial: '+420', flag: '🇨🇿', name: 'Česko' },
  { code: 'RO', dial: '+40', flag: '🇷🇴', name: 'România' },
  { code: 'GR', dial: '+30', flag: '🇬🇷', name: 'Ελλάδα' },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'United States' },
  { code: 'MA', dial: '+212', flag: '🇲🇦', name: 'المغرب' },
  { code: 'AR', dial: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: 'BR', dial: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: 'CO', dial: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: 'MX', dial: '+52', flag: '🇲🇽', name: 'México' },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

/**
 * Separa un número guardado en prefijo y resto.
 *
 * Se prueba del prefijo más largo al más corto: si no, «+1» se comería
 * cualquier número que empezara por uno.
 */
export const splitPhone = (value: string): { country: Country; number: string } => {
  const clean = value.replace(/[^\d+]/g, '');

  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => clean.startsWith(c.dial));

  if (!match) return { country: DEFAULT_COUNTRY, number: clean.replace(/^\+/, '') };
  return { country: match, number: clean.slice(match.dial.length) };
};

interface PhoneInputProps {
  /** Número completo en formato internacional, por ejemplo `+34600000000`. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  onBlur,
  id,
  disabled,
  placeholder,
}) => {
  const { t } = useTranslation();
  const { country, number } = useMemo(() => splitPhone(value ?? ''), [value]);

  const emit = (dial: string, rest: string) => onChange(`${dial}${rest.replace(/\D/g, '')}`);

  return (
    <div className="flex gap-2">
      <Select
        value={country.code}
        disabled={disabled}
        onValueChange={(code) => {
          const next = COUNTRIES.find((c) => c.code === code) ?? DEFAULT_COUNTRY;
          emit(next.dial, number);
        }}
      >
        <SelectTrigger className="w-[7.5rem] shrink-0" aria-label={t('auth.phonePrefix')}>
          <SelectValue>
            <span className="flex items-center gap-2">
              <span aria-hidden>{country.flag}</span>
              <span className="tabular-nums">{country.dial}</span>
            </span>
          </SelectValue>
        </SelectTrigger>

        <SelectContent className="max-h-72">
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="flex items-center gap-2">
                <span aria-hidden>{c.flag}</span>
                <span className="tabular-nums w-12">{c.dial}</span>
                <span className="text-muted-foreground">{c.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        className="flex-1"
        disabled={disabled}
        placeholder={placeholder ?? '600 000 000'}
        value={number}
        onBlur={onBlur}
        onChange={(e) => emit(country.dial, e.target.value)}
      />
    </div>
  );
};

export default PhoneInput;
