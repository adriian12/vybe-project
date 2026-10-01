import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';
import Flag from '@/components/ui-custom/flag';
import { api } from '@/services/api';

interface LanguageSwitcherProps {
  className?: string;
}

/**
 * Selector de idioma.
 *
 * Mallorca en temporada es sobre todo turismo alemán y británico: una app de
 * fiesta sólo en español se cierra a su propio mercado.
 *
 * El disparador enseña la bandera del idioma activo. Antes era un icono de
 * ideogramas igual para los cuatro, así que no se sabía en qué idioma estabas
 * sin abrir el menú, que es justo lo que un selector debería ahorrarte.
 */
const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className }) => {
  const { i18n, t } = useTranslation();

  const current =
    SUPPORTED_LANGUAGES.find((l) => i18n.resolvedLanguage === l.code) ?? SUPPORTED_LANGUAGES[0];

  const change = async (code: string) => {
    // Pasa por el módulo de i18n, que descarga el diccionario antes de
    // cambiar: los idiomas distintos del español no vienen en el bundle.
    await changeLanguage(code);
    // Guardamos la preferencia en el perfil para que viaje entre dispositivos.
    try {
      await api.updateProfile({ locale: code });
    } catch {
      // Sin sesión el cambio vive sólo en este navegador, que es suficiente.
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`press flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-card text-foreground hover:border-party-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`}
        aria-label={`${t('common.language')}: ${current.label}`}
      >
        <Flag code={current.code} size={16} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        {SUPPORTED_LANGUAGES.map((language) => {
          const active = i18n.resolvedLanguage === language.code;

          return (
            <DropdownMenuItem
              key={language.code}
              onClick={() => void change(language.code)}
              className={active ? 'font-semibold' : undefined}
            >
              <span className="mr-2 inline-flex w-6 justify-center">
                <Flag code={language.code} size={14} />
              </span>
              <span className="flex-1">{language.label}</span>
              {active && <Check size={14} className="ml-2 text-party-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
