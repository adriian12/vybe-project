import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { LEGAL_VERSIONS } from '@/services/privacy';
import { COMPANY } from '@/lib/company';

/**
 * Términos y política de privacidad.
 *
 * Recoge el tratamiento que la app hace realmente (ubicación, fotos, chat,
 * asistencia a eventos). **Debe revisarlo un abogado antes de abrir a usuarios
 * reales**: aquí hay decisiones que no son técnicas.
 */

const PRIVACY_SECTIONS = [
  {
    title: 'Responsable del tratamiento',
    body: `${COMPANY.name} (${COMPANY.taxId}), con domicilio en ${COMPANY.address}. Para cualquier cuestión sobre tus datos personales, incluido el ejercicio de tus derechos, puedes escribir a ${COMPANY.email}.`,
  },
  {
    title: 'Qué datos tratamos',
    body: 'Datos de cuenta (email, nombre, edad, género y teléfono), fotografías tomadas con la cámara, ubicación geográfica mientras usas la app, asistencia a eventos, interacciones (likes, matches), mensajes con otras personas e información técnica del dispositivo. El teléfono se pide al crear la cuenta y no se muestra a nadie: sirve para avisarte y para poder actuar en un caso de seguridad.',
  },
  {
    title: 'Para qué los usamos',
    body: 'Para verificar que estás físicamente en un evento, mostrarte a otras personas del mismo evento, permitir el chat entre quienes hacen match, moderar la plataforma y prevenir abusos, y elaborar estadísticas agregadas para los locales.',
  },
  {
    title: 'Base legal',
    body: 'La ejecución del contrato de uso del servicio para las funciones esenciales; tu consentimiento explícito para el tratamiento de la ubicación y las fotografías; y nuestro interés legítimo en garantizar la seguridad de la comunidad.',
  },
  {
    title: 'Ubicación',
    body: 'Sólo usamos tu ubicación cuando la app está abierta y para comprobar que estás dentro del radio del evento. No la compartimos con otros usuarios: sólo mostramos una distancia aproximada. Puedes revocar el permiso cuando quieras, desde los ajustes del navegador o del teléfono según cómo uses Vybe.',
  },
  {
    title: 'Fotografías',
    body: 'La foto de cada evento se toma con la cámara en el momento. Ninguna fotografía se publica sin pasar antes por moderación automática, y si el servicio de moderación no responde la foto queda a la espera de revisión manual en lugar de publicarse. Al eliminarla se borra también del almacenamiento.',
  },
  {
    title: 'Verificación facial',
    body: 'Para verificar que hay una persona real detrás de cada cuenta analizamos la fotografía que envías con un servicio automático que detecta cuántas caras aparecen. Es un tratamiento de datos biométricos, de los que el Reglamento considera de categoría especial, y por eso se hace únicamente con tu consentimiento explícito y sólo con esa finalidad: no identificamos a nadie, no comparamos tu cara con ninguna base de datos ni guardamos ninguna plantilla biométrica. La fotografía se descarta si no supera la comprobación. Puedes usar Vybe sin verificarte, aunque entonces no aparecerás en el tablón de los eventos.',
  },
  {
    title: 'Con quién los compartimos',
    body: 'Con otros usuarios presentes en tu mismo evento (nombre, edad, bio, fotos, distancia aproximada e intereses). Con los locales sólo en forma de estadísticas agregadas, nunca identificándote: los grupos con muy pocas personas se descartan para que nadie pueda deducir de quién se trata. Con proveedores que actúan como encargados del tratamiento: alojamiento y base de datos (Supabase), envío de correo (Resend), envío de SMS (Twilio), avisos al teléfono (Google Firebase Cloud Messaging y Apple Push Notification service), moderación de imágenes (Sightengine), pasarela de pago (Stripe) y monitorización de errores (Sentry).',
  },
  {
    title: 'Cuánto tiempo los conservamos',
    body: 'Las conversaciones de un evento caducan 24 horas después de que este termine, salvo que ambas personas decidan conservarlas. Las fotografías rechazadas por la moderación se borran de inmediato. El resto de datos se conservan mientras la cuenta esté activa y, tras su eliminación, únicamente durante los plazos legales aplicables.',
  },
  {
    title: 'Tus derechos',
    body: `Puedes acceder, rectificar, suprimir, limitar y portar tus datos, así como oponerte a su tratamiento y retirar tu consentimiento. Desde Perfil → Privacidad y datos puedes descargar toda tu información y eliminar la cuenta al instante, sin tener que escribirnos. Para cualquier otra solicitud: ${COMPANY.email}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).`,
  },
  {
    title: 'Menores',
    body: 'Vybe es un servicio exclusivamente para mayores de 18 años. Si detectamos una cuenta de una persona menor de edad, la eliminaremos.',
  },
];

const TERMS_SECTIONS = [
  {
    title: 'Objeto',
    body: 'Vybe es una aplicación que permite conocer a otras personas que asisten al mismo evento presencial. El acceso requiere verificar la ubicación y canjear un código facilitado por el local.',
  },
  {
    title: 'Requisitos de uso',
    body: 'Debes ser mayor de 18 años, facilitar información veraz —incluido un teléfono en el que se te pueda localizar— y usar fotografías propias. La del evento se toma con la cámara en el momento. Una cuenta por persona.',
  },
  {
    title: 'Normas de conducta',
    body: 'No se permite el acoso, los contenidos sexuales explícitos, la suplantación de identidad, la publicidad no autorizada ni la solicitud de dinero. El incumplimiento puede suponer la suspensión o eliminación de la cuenta sin previo aviso.',
  },
  {
    title: 'Seguridad',
    body: 'Vybe no verifica los antecedentes de sus usuarios. Reúnete siempre en lugares públicos, avisa a alguien de confianza y utiliza el botón de emergencia si te sientes en peligro. El uso del servicio es bajo tu propia responsabilidad.',
  },
  {
    title: 'Contenido de los usuarios',
    body: 'Conservas la titularidad de tus fotografías y textos. Nos concedes una licencia limitada para mostrarlos dentro de la aplicación mientras tu cuenta esté activa.',
  },
  {
    title: 'Suscripción Premium',
    body: 'Las suscripciones se renuevan automáticamente salvo cancelación. Puedes cancelarlas en cualquier momento desde tu perfil; el acceso se mantiene hasta el final del periodo pagado. Se aplica el derecho de desistimiento previsto en la normativa de consumo.',
  },
  {
    title: 'Locales',
    body: 'Los establecimientos deben facilitar su identificación fiscal y la dirección del local, y acreditar su titularidad con documentación, que se revisa antes de aprobar la cuenta. Son responsables de la veracidad de los eventos que publican y de la custodia de sus códigos de acceso.',
  },
  {
    title: 'Responsabilidad',
    body: 'Prestamos el servicio "tal cual". No garantizamos la disponibilidad ininterrumpida ni nos hacemos responsables de lo que ocurra en los encuentros presenciales entre usuarios.',
  },
  {
    title: 'Ley aplicable',
    body: 'Estas condiciones se rigen por la legislación española. Para cualquier controversia serán competentes los juzgados del domicilio del consumidor.',
  },
  {
    title: 'Titular del servicio',
    body: `${COMPANY.name} (${COMPANY.taxId}), ${COMPANY.address}. Contacto: ${COMPANY.email}.`,
  },
];

const LegalPage = () => {
  const { document: doc } = useParams<{ document: string }>();
  const { t } = useTranslation();

  const isPrivacy = doc === 'privacy';
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const version = isPrivacy ? LEGAL_VERSIONS.privacy : LEGAL_VERSIONS.terms;

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-party-primary mb-6">
          <ArrowLeft size={16} />
          {t('common.goHome')}
        </Link>

        <h1 className="text-2xl font-bold mb-1">
          {t(isPrivacy ? 'privacy.privacyLink' : 'privacy.termsLink')}
        </h1>
        <p className="text-sm text-party-gray mb-8">v{version}</p>

        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-semibold mb-2">{section.title}</h2>
              <p className="text-sm text-party-gray leading-relaxed">{section.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 text-xs text-party-gray border-t border-border pt-6">
          Documento pendiente de revisión legal antes de abrir el servicio al público.
        </p>
      </div>
    </div>
  );
};

export default LegalPage;
