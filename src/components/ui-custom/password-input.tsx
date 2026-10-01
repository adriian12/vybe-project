import { forwardRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Campo de contraseña con candado a la izquierda y el ojo para verla, como en
 * «Crea tu cuenta» de Stitch.
 *
 * El ojo importa más en móvil que en escritorio: con el teclado pequeño y de
 * noche, una contraseña mal escrita es el motivo número uno de «no me deja
 * entrar».
 */
const PasswordInput = forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, ...props }, ref) => {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Lock
          size={17}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-party-gray"
        />
        {/* Con el ojo abierto el campo es de texto y el teclado del iPhone
            ponía la primera letra en mayúscula: la contraseña guardada no
            coincidía con la que se escribía después. */}
        <Input
          ref={ref}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...props}
          type={visible ? 'text' : 'password'}
          className={cn('pl-11 pr-12', className)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={visible}
          className="press absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-party-gray hover:text-foreground"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
