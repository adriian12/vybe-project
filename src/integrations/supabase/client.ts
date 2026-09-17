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
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    ...(authStorage ? { storage: authStorage } : {}),
  },
});
