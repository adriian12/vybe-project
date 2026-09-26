import { useTranslation } from 'react-i18next';

/**
 * Botón flotante de WhatsApp de la landing, para que un negocio pregunte sin
 * rellenar el formulario. El número va en `VITE_WHATSAPP_NUMBER` (con prefijo,
 * sin espacios ni «+», por ejemplo 34600000000): sin él, el botón no sale.
 */
const NUMERO = (import.meta.env.VITE_WHATSAPP_NUMBER ?? '').replace(/\D/g, '');

const WhatsAppButton = () => {
  const { t } = useTranslation();
  if (!NUMERO) return null;
  const texto = encodeURIComponent(t('landing.whatsapp.message'));
  return (
    <a
      href={`https://wa.me/${NUMERO}?text=${texto}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('landing.whatsapp.label')}
      title={t('landing.whatsapp.label')}
      className="press fixed bottom-[calc(1rem+var(--safe-bottom,0px))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/40"
    >
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" fill="currentColor">
        <path d="M16.04 3C9.4 3 4 8.37 4 15c0 2.34.68 4.6 1.95 6.54L4 29l7.66-1.99A12.06 12.06 0 0 0 16.04 27C22.66 27 28 21.63 28 15S22.66 3 16.04 3Zm0 21.9c-1.86 0-3.68-.5-5.27-1.45l-.38-.22-4.55 1.18 1.21-4.42-.25-.4A9.8 9.8 0 0 1 5.9 15c0-5.52 4.55-10.02 10.14-10.02 5.58 0 10.1 4.5 10.1 10.02 0 5.53-4.52 9.9-10.1 9.9Zm5.55-7.42c-.3-.15-1.8-.88-2.07-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.96 1.18-.18.2-.35.22-.66.07-.3-.15-1.28-.47-2.43-1.5-.9-.8-1.5-1.78-1.68-2.08-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.68-1.63-.93-2.23-.24-.58-.5-.5-.68-.51h-.58c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.8-.73 2.05-1.44.25-.71.25-1.32.18-1.44-.07-.13-.27-.2-.57-.35Z" />
      </svg>
    </a>
  );
};

export default WhatsAppButton;
