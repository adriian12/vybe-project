import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { authStorage } from './auth-storage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

/**
 * La sesión dura hasta que alguien pulsa «Cerrar sesión»: se guarda
 * (`persistSession`), el token se renueva solo (`autoRefreshToken`) y dentro de
 * la app instalada vive en las preferencias nativas (`auth-storage.ts`).
 */
/** Evento que lanza cualquier respuesta 429 (límite de peticiones, migración 092). */
export const RATE_LIMITED_EVENT = 'fiestea:rate-limited';

/** `fetch` que avisa a la interfaz cuando el servidor dice «demasiadas peticiones». */
const fetchConAviso = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const respuesta = await fetch(input, init);
  if (respuesta.status === 429 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(RATE_LIMITED_EVENT));
  }
  return respuesta;
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: fetchConAviso },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    ...(authStorage ? { storage: authStorage } : {}),
  },
});
