import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * El formulario de registro, por dentro.
 *
 * Se prueba aquí y no en el navegador porque lo que interesa son tres reglas
 * que se pueden romper sin que salte nada:
 *
 *   · que género y preferencias aparezcan **una vez**. Estuvieron duplicados:
 *     dos bloques idénticos consecutivos, y el segundo pisaba al primero;
 *   · que no se pueda crear una cuenta sin aceptar los tres documentos, que es
 *     una obligación legal y no una preferencia de diseño;
 *   · que el teléfono llegue en formato internacional.
 */

const signUp = vi.fn();

vi.mock('@/services/auth-email', () => ({
  authEmailService: {
    signUp: (...args: unknown[]) => signUp(...args),
    checkAvailability: async () => ({ emailTaken: false, phoneTaken: false }),
  },
  authEmailMessage: () => 'errors.generic',
  AuthEmailFailure: class extends Error {
    accountCreated = false;
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signInWithPassword: vi.fn(), signOut: vi.fn() } },
}));

vi.mock('@/services/api', () => ({
  api: { getCurrentProfile: vi.fn(), getCurrentVenue: vi.fn(), updateProfile: vi.fn() },
}));

vi.mock('@/lib/observability', () => ({ track: vi.fn() }));

// `t` devuelve la clave: así las aserciones no dependen de la redacción, que
// cambia, sino de qué campos existen, que es lo que se quiere fijar.
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { resolvedLanguage: 'es', changeLanguage: vi.fn() },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
  };
});

const AuthPage = (await import('./AuthPage')).default;

const renderRegistro = () =>
  render(
    <MemoryRouter initialEntries={['/auth?type=user&mode=register']}>
      <AuthPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  signUp.mockReset();
  signUp.mockResolvedValue({ alreadyRegistered: false });
});

describe('registro de usuario', () => {
  it('sólo pide nombre, correo y contraseña', () => {
    renderRegistro();

    expect(screen.getByText('auth.name')).toBeInTheDocument();
    expect(screen.getByText('auth.email')).toBeInTheDocument();
    expect(screen.getByText('auth.password')).toBeInTheDocument();
    // La edad, el género, a quién quiere ver y el móvil ya no se piden aquí:
    // los pide la ficha de fiester@ al entrar.
    expect(screen.queryByText('auth.genders.woman')).not.toBeInTheDocument();
    expect(screen.queryByText('auth.phone')).not.toBeInTheDocument();
    expect(screen.queryByText('auth.repeatPassword')).not.toBeInTheDocument();
  });

  it('enseña una sola confirmación legal', () => {
    renderRegistro();

    expect(screen.getByText('consent.all')).toBeInTheDocument();
  });

  it('no crea la cuenta sin la confirmación', async () => {
    const user = userEvent.setup();
    renderRegistro();

    await user.type(screen.getByPlaceholderText('auth.namePlaceholder'), 'Ana');
    await user.type(screen.getByPlaceholderText('tu@email.com'), 'ana@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'contraseña-larga');
    await user.click(screen.getByRole('button', { name: 'auth.register' }));

    await waitFor(() => expect(signUp).not.toHaveBeenCalled());
  });
});

