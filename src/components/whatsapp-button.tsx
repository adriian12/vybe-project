import { useTranslation } from 'react-i18next';
import { WhatsAppIcon } from '@/components/brand-icons';

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
      <WhatsAppIcon size={28} />
    </a>
  );
};

export default WhatsAppButton;
