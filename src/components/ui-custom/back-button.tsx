import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';

/**
 * Volver, sólo con la flecha.
 *
 * Lleva borde y fondo en lugar de ser un icono suelto: en una cabecera oscura
 * un icono sin caja no se lee como algo que se pueda pulsar, y era el control
 * que más se buscaba a tientas. El nombre va en `aria-label`, así que quien use
 * lector de pantalla lo sigue oyendo sin que ocupe media cabecera.
 */
export const BackButton = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      aria-label={t('common.back')}
      className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-foreground hover:bg-surface-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
};
