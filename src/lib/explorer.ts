import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { track } from '@/lib/observability';

/**
 * «Ver fiestas sin cuenta» (migración 148).
 *
 * Quien explora tiene una sesión anónima de Supabase: las pantallas de fiestas,
 * mapa y locales funcionan igual que con cuenta, pero no hay perfil. Lo que
 * necesita cuenta (seguir, avisos, entradas, entrar en la fiesta…) abre el aviso
 * de `require-account-sheet.tsx` con `requestAccount()`.
 *
 * Al registrarse o entrar con Apple, Google o correo la sesión anónima se
 * sustituye por la nueva; la base de datos borra las anónimas al mes.
 */
export const startExploring = async (): Promise<void> => {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  track('explore_started');
};

export const isAnonymousUser = (user: User | null | undefined): boolean => Boolean(user?.is_anonymous);

/** Para qué hace falta la cuenta: cambia el texto del aviso. */
export type AccountReason =
  | 'follow'
  | 'tickets'
  | 'enter'
  | 'crushes'
  | 'chat'
  | 'profile'
  | 'notifications'
  | 'raffle'
  | 'save'
  | 'offer'
  | 'list'
  | 'generic';

const EVENTO = 'fiestea:require-account';

/** Abre el aviso «Crea tu cuenta para…». */
export const requestAccount = (reason: AccountReason = 'generic'): void => {
  window.dispatchEvent(new CustomEvent<AccountReason>(EVENTO, { detail: reason }));
};

// Lo pone `app-context` al cargar la sesión: así cualquier botón puede
// preguntarlo sin tener que leer el contexto.
let explorando = false;
export const setExplorerMode = (value: boolean): void => {
  explorando = value;
};
export const isExploring = (): boolean => explorando;

/**
 * Para el principio de cada acción que necesita cuenta:
 * `if (needsAccount('follow')) return;` abre el aviso y corta la acción.
 */
export const needsAccount = (reason: AccountReason = 'generic'): boolean => {
  if (!explorando) return false;
  requestAccount(reason);
  return true;
};

export const onAccountRequested =(fn: (reason: AccountReason) => void): (() => void) => {
  const handler = (e: Event) => fn((e as CustomEvent<AccountReason>).detail ?? 'generic');
  window.addEventListener(EVENTO, handler);
  return () => window.removeEventListener(EVENTO, handler);
};
