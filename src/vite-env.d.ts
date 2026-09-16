/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_ANALYTICS_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_FACE_VERIFICATION_URL?: string;
  /** Dominio público de la web, para los enlaces que se comparten desde la app instalada. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Versión del build, inyectada por Vite (véase `vite.config.ts`). */
declare const __APP_RELEASE__: string;
