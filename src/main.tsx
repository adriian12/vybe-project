import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// Tipografías del sistema de diseño «Balearic Electric» (Stitch): Outfit para
// titulares y Plus Jakarta Sans para el texto. Van empaquetadas y no desde
// Google Fonts porque la aplicación instalada tiene que verse igual sin red.
import '@fontsource-variable/outfit';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import { i18nReady } from './i18n';
import { initObservability } from '@/lib/observability';
import ErrorBoundary from '@/components/error-boundary';
import { setupAuthRefreshOnResume, setupNativeShell } from '@/services/native';

// Los datos de prueba se cargan con las migraciones SQL 004/005, no desde el
// cliente: crear usuarios con signUp() en el arranque agotaba el rate limit.
initObservability();

// Dentro de la aplicación instalada hay que quitar el splash y ajustar la barra
// de estado. En el navegador no hace nada.
void setupNativeShell();
void setupAuthRefreshOnResume();

// Se espera al diccionario del idioma detectado antes de pintar. Pintar antes
// hacía que la primera pantalla saliera en español y cambiara de golpe.
void i18nReady.finally(() => {
  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary area="root">
      <App />
    </ErrorBoundary>,
  );
});
