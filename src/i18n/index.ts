import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import es from './locales/es.json';

/**
 * Los idiomas de la aplicación.
 *
 * Aquí no hay bandera: las pinta `components/ui-custom/flag.tsx`. Estuvieron
 * como emoji y no servían, porque Windows no trae fuente de banderas y las
 * dibujaba como pares de letras, y porque el catalán no tiene ninguna secuencia
 * de bandera en Unicode.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ca', label: 'Català' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const LANGUAGE_STORAGE_KEY = 'vybe_language';

const CODIGOS = SUPPORTED_LANGUAGES.map((l) => l.code) as readonly string[];

/**
 * Los otros tres idiomas se descargan cuando hacen falta.
 *
 * Los cuatro diccionarios ocupan 165 KB y sólo se usa uno. Iban todos en el
 * fichero principal, así que abrir la aplicación en Palma descargaba también
 * el alemán, el inglés y el catalán antes de pintar nada.
 *
 * El español se queda dentro: es el idioma de respaldo, y tenerlo desde el
 * primer momento significa que ante cualquier fallo se ve español en lugar de
 * los nombres de las claves.
 */
const cargadores: Record<Exclude<LanguageCode, 'es'>, () => Promise<{ default: object }>> = {
  en: () => import('./locales/en.json'),
  de: () => import('./locales/de.json'),
  ca: () => import('./locales/ca.json'),
};

const esSoportado = (code: string | null | undefined): code is LanguageCode =>
  typeof code === 'string' && CODIGOS.includes(code.slice(0, 2));

/**
 * Qué idioma toca.
 *
 * Se detecta a mano en lugar de con `i18next-browser-languagedetector` porque
 * el detector elige entre los idiomas que ya tienen diccionario cargado, y aquí
 * sólo hay uno hasta que se descarga el que toque: con él puesto, un navegador
 * en alemán acababa siempre en español.
 *
 * Mallorca en temporada es mayoritariamente turismo alemán y británico, así que
 * la preferencia del navegador importa de verdad.
 */
const detectar = (): LanguageCode => {
  try {
    const guardado = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (esSoportado(guardado)) return guardado.slice(0, 2) as LanguageCode;
  } catch {
    // Navegación privada o almacenamiento bloqueado: se sigue con el navegador.
  }

  const candidatos = typeof navigator !== 'undefined' ? navigator.languages ?? [] : [];
  for (const candidato of [...candidatos, navigator?.language]) {
    if (esSoportado(candidato)) return candidato.slice(0, 2) as LanguageCode;
  }

  return 'es';
};

/** Descarga un diccionario y lo registra, si no estaba ya. */
export const loadLanguage = async (code: string): Promise<void> => {
  const idioma = code.slice(0, 2) as LanguageCode;
  if (idioma === 'es' || !(idioma in cargadores)) return;
  if (i18n.hasResourceBundle(idioma, 'translation')) return;

  const { default: recursos } = await cargadores[idioma as Exclude<LanguageCode, 'es'>]();
  i18n.addResourceBundle(idioma, 'translation', recursos, true, true);
};

/** Cambia de idioma descargando antes su diccionario. */
export const changeLanguage = async (code: string): Promise<void> => {
  try {
    await loadLanguage(code);
  } catch (error) {
    // Sin diccionario se cambia igual y se ve español: mejor eso que nada.
    console.error('No se pudo cargar el idioma', code, error);
  }

  await i18n.changeLanguage(code);

  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // El cambio vive sólo en esta pestaña, que es suficiente.
  }
};

/**
 * Arranque. Se espera desde `main.tsx` antes de pintar: si se pintara antes,
 * la primera pantalla saldría en español y cambiaría de golpe al idioma bueno.
 */
export const i18nReady = (async () => {
  const inicial = detectar();
  const resources: Record<string, { translation: object }> = { es: { translation: es } };

  if (inicial !== 'es') {
    try {
      const { default: recursos } = await cargadores[inicial as Exclude<LanguageCode, 'es'>]();
      resources[inicial] = { translation: recursos };
    } catch (error) {
      console.error('No se pudo cargar el idioma inicial', inicial, error);
    }
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: inicial,
    fallbackLng: 'es',
    supportedLngs: CODIGOS as string[],
    nonExplicitSupportedLngs: true, // "en-GB" resuelve a "en"
    interpolation: { escapeValue: false },
  });
})();

// Mantiene el atributo lang del documento sincronizado, que importa para los
// lectores de pantalla y para la traducción automática del navegador.
i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

export default i18n;
