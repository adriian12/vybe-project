import { useState } from 'react';
import { Bug } from 'lucide-react';
import { throwTestError } from '@/lib/observability';

/**
 * Botón para comprobar que Sentry recibe eventos.
 *
 * Sólo se monta en desarrollo y sólo si hay DSN configurado, así que nunca
 * llega a producción. El error se lanza desde un manejador de eventos: React
 * no lo captura en un Error Boundary, pero sí lo recoge el handler global de
 * Sentry, que es justo lo que queremos verificar.
 */
const DevSentryCheck = () => {
  const [fired, setFired] = useState(false);

  if (!import.meta.env.DEV || !import.meta.env.VITE_SENTRY_DSN) return null;

  // Icono suelto y pegado al borde: en 375 px de ancho cualquier overlay
  // acaba tapando un botón del formulario.
  return (
    <button
      type="button"
      onClick={() => {
        setFired(true);
        throwTestError();
      }}
      title={fired ? 'Error enviado a Sentry' : 'Lanza un error de prueba y lo envía a Sentry'}
      aria-label="Probar Sentry"
      className={`fixed bottom-1 left-1 z-50 rounded-full border border-border bg-card/70 p-1.5 shadow-sm backdrop-blur transition-opacity hover:opacity-100 ${
        fired ? 'text-party-primary opacity-70' : 'text-party-gray opacity-40'
      }`}
    >
      <Bug size={12} />
    </button>
  );
};

export default DevSentryCheck;
