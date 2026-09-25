import { COMPANY } from '@/lib/company';

/**
 * Los textos legales, en español. Se sirven en `fiestea.es/legal/<documento>`
 * (y en cualquier dominio de la app), con un índice en `/legal`.
 *
 * Recogen lo que la app hace de verdad. **Debe revisarlos un abogado antes de
 * abrir el servicio al público**: hay decisiones que no son técnicas.
 *
 * Cada documento tiene un nombre corto en inglés (el que ya usaban los enlaces
 * y el registro de consentimientos: `privacy`, `terms`) y alias en español para
 * las URL que se dan a las tiendas y a la gente.
 */

export type LegalDocId =
  | 'privacy'
  | 'terms'
  | 'cookies'
  | 'notice'
  | 'purchases'
  | 'venues'
  | 'delete-account'
  | 'support';

export interface LegalSection {
  title: string;
  body: string;
}

export interface LegalDoc {
  id: LegalDocId;
  /** La URL que se comparte: `/legal/<slug>`. */
  slug: string;
  title: string;
  summary: string;
  sections: LegalSection[];
}

/** Última revisión de los textos. */
export const LEGAL_UPDATED = '25 de septiembre de 2026';

const ALIASES: Record<string, LegalDocId> = {
  privacy: 'privacy',
  privacidad: 'privacy',
  'politica-de-privacidad': 'privacy',
  terms: 'terms',
  terminos: 'terms',
  'terminos-y-condiciones': 'terms',
  condiciones: 'terms',
  cookies: 'cookies',
  'politica-de-cookies': 'cookies',
  notice: 'notice',
  'aviso-legal': 'notice',
  purchases: 'purchases',
  compras: 'purchases',
  'condiciones-de-compra': 'purchases',
  venues: 'venues',
  locales: 'venues',
  'condiciones-para-locales': 'venues',
  'delete-account': 'delete-account',
  'eliminar-cuenta': 'delete-account',
  support: 'support',
  soporte: 'support',
  ayuda: 'support',
};

export const resolveLegalDoc = (slug: string | undefined): LegalDocId | null =>
  (slug && ALIASES[slug.toLowerCase()]) || null;

/**
 * Los documentos, con el nombre de la app y los dominios de cada marca.
 *
 * @param app  «Fiestea» o «Vybes».
 * @param web  La web pública (landing y textos legales).
 * @param panel La web de locales y administración.
 * @param miembro Cómo se llama a quien sale en el tablón («fiester@», «vyber»).
 */
export const legalDocs = (app: string, web: string, panel: string, miembro: string): LegalDoc[] => {
  const titular = `${COMPANY.name} (${COMPANY.taxId}), con domicilio en ${COMPANY.address}`;
  const correo = COMPANY.email;
  const dominio = web.replace(/^https?:\/\//, '');

  return [
    // ------------------------------------------------------------ privacidad
    {
      id: 'privacy',
      slug: 'privacidad',
      title: 'Política de privacidad',
      summary: 'Qué datos tratamos, para qué, con quién los compartimos y cómo ejercer tus derechos.',
      sections: [
        {
          title: 'Responsable del tratamiento',
          body: `${titular}. Para cualquier cuestión sobre tus datos, incluido el ejercicio de tus derechos, escribe a ${correo}.`,
        },
        {
          title: 'Qué datos tratamos',
          body: `Datos de cuenta: correo, nombre, fecha de nacimiento o edad, género, a quién quieres ver y teléfono. Fotografías: la foto del momento que haces con la cámara al entrar en una fiesta y, si las añades, las de tu perfil. Ubicación mientras usas la app para entrar en una fiesta. Actividad en ${app}: fiestas en las que dices que vas a ir o en las que entras, locales que sigues, likes, supercrush, matches, mensajes, peticiones de canciones, retos, sorteos, vales, valoraciones, entradas compradas y apuntes a listas de invitados (nombre y número de acompañantes). Datos de pago: los gestionan Stripe o, en el iPhone, Apple; nosotros sólo recibimos el resultado, el producto y el importe, nunca el número de tarjeta. Datos técnicos: tipo de dispositivo, idioma, avisos push y registros de errores.`,
        },
        {
          title: 'Para qué los usamos',
          body: `Para crear y mantener tu cuenta; comprobar que estás en la fiesta; enseñarte a otras personas de la misma fiesta si entras como ${miembro} y permitir el chat cuando hay match; gestionar las entradas, los vales, las listas de invitados y las suscripciones que contratas; mandarte los avisos que activas (fiestas nuevas de los locales que sigues, que empieza una fiesta a la que vas, mensajes y matches); atender las alertas de ayuda; moderar la plataforma y prevenir abusos; y elaborar estadísticas agregadas para los locales.`,
        },
        {
          title: 'Base legal',
          body: 'La ejecución del contrato de uso para las funciones del servicio y para las compras; tu consentimiento para la ubicación, las fotografías, la verificación facial y los avisos push, que puedes retirar cuando quieras; nuestro interés legítimo en la seguridad de la comunidad, la prevención del fraude y la mejora del servicio; y el cumplimiento de obligaciones legales, como las fiscales y contables de los pagos.',
        },
        {
          title: 'Ubicación',
          body: 'Sólo usamos tu ubicación con la app abierta y para comprobar que estás dentro del radio de la fiesta al entrar. No la compartimos con otras personas: como mucho, una distancia aproximada. Si pides ayuda con el botón de emergencia, tu ubicación de ese momento llega al personal del local y a los contactos de confianza que hayas elegido. Puedes quitar el permiso desde los ajustes del teléfono o del navegador.',
        },
        {
          title: 'Fotografías y verificación facial',
          body: `La foto del momento se hace con la cámara, no se puede subir de la galería y dura lo que dura la noche: se borra al salir de la fiesta o cuando termina. Ninguna foto se publica sin pasar antes por una moderación automática (Sightengine), que comprueba que no haya contenido prohibido y que haya una sola cara. Esa comprobación es un tratamiento de datos biométricos: se hace sólo con tu consentimiento explícito y sólo para saber que hay una persona real; no identificamos a nadie, no comparamos tu cara con ninguna base de datos ni guardamos plantillas biométricas. Si la moderación no responde, la foto no se publica y queda pendiente de revisión manual. Puedes usar ${app} como invitado, sin foto.`,
        },
        {
          title: 'Qué ven otras personas y los locales',
          body: `Si entras como ${miembro}, quienes están en la misma fiesta ven tu nombre de pila, edad, fotos, bio e intereses. Como invitado no apareces en el tablón. El local ve sus estadísticas siempre agregadas (los grupos con muy pocas personas se descartan para que nadie pueda deducir de quién se trata), las valoraciones sin nombre, y el nombre de pila, la edad y la foto de quien marca «voy a ir». Si te apuntas a una lista de invitados, el local y su equipo de puerta (propietarios, seguridad y la persona de relaciones públicas de esa lista) ven el nombre que das y cuántos acompañantes llevas. Si compras una entrada, el local ve tu nombre y el tipo de entrada al validarla.`,
        },
        {
          title: 'Con quién los compartimos',
          body: 'Con proveedores que tratan los datos por encargo nuestro y con contrato: Supabase (base de datos, cuentas y almacenamiento), Vercel (alojamiento de la web), Stripe (pagos y cobros de los locales), Apple (compras dentro de la app de iPhone), Resend (correo), Twilio (SMS), Google Firebase Cloud Messaging y Apple Push Notification service (avisos al teléfono), Sightengine (moderación de imágenes), Sentry (registro de errores, sin datos personales) y CARTO (mapas). No vendemos datos ni los cedemos para publicidad. Algunos de estos proveedores están fuera del Espacio Económico Europeo; en ese caso la transferencia se ampara en el Marco de Privacidad de Datos UE-EE. UU. o en las cláusulas contractuales tipo de la Comisión Europea. También podemos comunicar datos a las autoridades cuando la ley lo exija.',
        },
        {
          title: 'Cuánto tiempo los conservamos',
          body: 'La foto del momento, hasta que sales de la fiesta o termina. Los matches y sus conversaciones caducan una hora después del final de la fiesta, salvo que los guardes. Las fotos rechazadas por la moderación se borran al momento. Las listas de invitados y los datos de cada noche, lo que dura la fiesta y el tiempo necesario para las estadísticas del local. El resto, mientras la cuenta esté activa. Al eliminar la cuenta se borra todo, salvo los pedidos de entradas, que se quedan en las ventas del local sin tu nombre, y los justificantes de pago, que Stripe conserva el plazo que exige la ley (hasta seis años), bloqueados.',
        },
        {
          title: 'Tus derechos',
          body: `Puedes acceder a tus datos, rectificarlos, suprimirlos, limitar u oponerte a su tratamiento, pedir su portabilidad y retirar tu consentimiento. Desde Perfil → Privacidad y datos puedes descargar tu información, y desde Perfil → Eliminar cuenta, borrarla al momento. Para cualquier otra solicitud, escribe a ${correo}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).`,
        },
        {
          title: 'Menores',
          body: `${app} es sólo para mayores de 18 años. Si detectamos la cuenta de una persona menor, la eliminamos.`,
        },
        {
          title: 'Cambios',
          body: `Si cambiamos esta política de forma importante, te lo diremos en la app antes de que se aplique. La versión vigente está siempre en ${dominio}/legal/privacidad.`,
        },
      ],
    },

    // --------------------------------------------------------------- términos
    {
      id: 'terms',
      slug: 'terminos',
      title: 'Términos y condiciones de uso',
      summary: `Las normas para usar ${app}: requisitos, conducta, contenido, seguridad y responsabilidad.`,
      sections: [
        {
          title: 'Qué es este servicio',
          body: `${app} es una aplicación para descubrir fiestas y vivirlas: ver qué hay, decir que vas, entrar con el código del local y, si quieres, conocer a otras personas que están en la misma fiesta. El titular es ${titular}.`,
        },
        {
          title: 'Requisitos',
          body: 'Debes tener al menos 18 años, dar información veraz (también un teléfono en el que se te pueda localizar) y usar fotos propias. Una cuenta por persona y un teléfono por cuenta. Eres responsable de guardar tu contraseña.',
        },
        {
          title: `Invitado o ${miembro}`,
          body: `Como invitado ves las fiestas, las ofertas, los sorteos y los avisos de los locales. Como ${miembro}, además, haces la foto del momento, apareces en el tablón de la fiesta y puedes hacer match, participar en sorteos y retos y votar canciones. Puedes cambiar de modo con los límites que indica la app.`,
        },
        {
          title: 'Normas de conducta',
          body: 'No se permite el acoso, el contenido sexual explícito, la violencia, el odio, suplantar a otra persona, la publicidad no autorizada, pedir dinero ni usar la app para actividades ilegales. Tampoco hacer mal uso del botón de ayuda. Si alguien incumple estas normas puedes denunciarlo desde su perfil. Podemos suspender o eliminar cuentas, y el local puede retirar el acceso a una fiesta, sin aviso previo cuando haya un incumplimiento.',
        },
        {
          title: 'Seguridad',
          body: 'No comprobamos los antecedentes de nadie. Queda en lugares públicos, avisa a alguien de confianza y usa el botón de ayuda si te sientes en peligro: avisa al local y a tus contactos de confianza. En una emergencia, llama al 112.',
        },
        {
          title: 'Tu contenido',
          body: 'Tus fotos y textos siguen siendo tuyos. Nos das una licencia limitada, gratuita y no exclusiva para mostrarlos dentro de la app mientras tu cuenta esté activa y sólo para prestar el servicio.',
        },
        {
          title: 'Fiestas, locales y listas de invitados',
          body: `Las fiestas las organizan los locales, que responden de lo que publican: horarios, precios, aforo, edad mínima, normas de acceso, ofertas y premios. ${app} no organiza las fiestas ni garantiza que se celebren. Apuntarte a una lista de invitados no asegura la entrada: el local decide en la puerta.`,
        },
        {
          title: 'Compras',
          body: 'Premium, supercrush y entradas se rigen además por las condiciones de compra.',
        },
        {
          title: 'Responsabilidad',
          body: 'Prestamos el servicio con diligencia, pero no garantizamos que esté disponible sin interrupciones. No respondemos de lo que pase en los encuentros entre personas ni de lo que hagan los locales en sus fiestas, salvo en lo que la ley no permita excluir.',
        },
        {
          title: 'Baja',
          body: 'Puedes eliminar tu cuenta cuando quieras desde el perfil. Nosotros podemos cerrarla si incumples estos términos.',
        },
        {
          title: 'Ley aplicable',
          body: 'Se aplica la ley española. Si eres consumidor, son competentes los juzgados de tu domicilio. También puedes usar la plataforma europea de resolución de litigios en línea (ec.europa.eu/consumers/odr).',
        },
      ],
    },

    // ---------------------------------------------------------------- cookies
    {
      id: 'cookies',
      slug: 'cookies',
      title: 'Política de cookies',
      summary: 'Qué guardamos en tu dispositivo y por qué no usamos cookies de publicidad.',
      sections: [
        {
          title: 'Qué son',
          body: 'Las cookies y tecnologías parecidas (almacenamiento local del navegador o de la app) son pequeños datos que una web o una app guarda en tu dispositivo.',
        },
        {
          title: 'Qué usamos',
          body: `Sólo almacenamiento técnico, necesario para que ${app} funcione: la sesión iniciada (para no pedirte la contraseña cada vez), el idioma que eliges, la sección abierta del panel de locales y los ficheros de la web guardados por el navegador para que cargue rápido. En la app instalada, la sesión se guarda en el almacenamiento seguro del teléfono.`,
        },
        {
          title: 'Qué no usamos',
          body: 'No usamos cookies de publicidad, de redes sociales ni de seguimiento entre webs. Nuestras estadísticas de uso son propias, no guardan nada en tu dispositivo y no se comparten con terceros. El registro de errores (Sentry) no usa cookies ni recoge datos personales.',
        },
        {
          title: 'Terceros',
          body: 'Al pagar, se abre la página de Stripe, que usa sus propias cookies para prevenir el fraude (stripe.com/cookies-policy). El mapa carga imágenes de CARTO, que recibe tu dirección IP como cualquier servidor web.',
        },
        {
          title: 'Consentimiento',
          body: 'Al ser almacenamiento estrictamente necesario, está exento de consentimiento según el artículo 22.2 de la LSSI, y por eso no ves un aviso de cookies. Si algún día añadimos cookies de análisis o de publicidad, te pediremos permiso antes.',
        },
        {
          title: 'Cómo borrarlas',
          body: 'Puedes borrar las cookies y el almacenamiento desde los ajustes del navegador, o desinstalando la app. Si lo haces, se cerrará tu sesión.',
        },
      ],
    },

    // ------------------------------------------------------------ aviso legal
    {
      id: 'notice',
      slug: 'aviso-legal',
      title: 'Aviso legal',
      summary: 'Datos del titular del servicio (Ley 34/2002, de servicios de la sociedad de la información).',
      sections: [
        {
          title: 'Titular',
          body: `${COMPANY.name}. ${COMPANY.taxId}. Domicilio: ${COMPANY.address}. Correo: ${correo}.`,
        },
        {
          title: 'Objeto',
          body: `Este aviso regula el uso de ${dominio}, de ${panel.replace(/^https?:\/\//, '')} y de la aplicación ${app} para Android e iOS.`,
        },
        {
          title: 'Propiedad intelectual e industrial',
          body: `La marca ${app}, el logotipo, el diseño y el código de la web y de la app son del titular o se usan con permiso. No se pueden copiar, distribuir ni modificar sin autorización. Los carteles, nombres y logotipos de los locales y de sus fiestas son de sus titulares.`,
        },
        {
          title: 'Enlaces',
          body: 'Los enlaces a webs de terceros (locales, venta de entradas, Stripe…) se ofrecen como ayuda; no respondemos de su contenido.',
        },
        {
          title: 'Ley aplicable',
          body: 'Se aplica la ley española. Para cualquier controversia, los juzgados que correspondan según la ley; si eres consumidor, los de tu domicilio.',
        },
      ],
    },

    // ---------------------------------------------------------------- compras
    {
      id: 'purchases',
      slug: 'compras',
      title: 'Condiciones de compra',
      summary: 'Premium, supercrush, destacar una fiesta y entradas: precios, pagos, desistimiento y devoluciones.',
      sections: [
        {
          title: 'Qué se puede comprar',
          body: `Premium (suscripción mensual o para una sola fiesta), supercrush sueltos, destacar una fiesta (para locales) y entradas o mesas de las fiestas de los locales que las venden en ${app}. El precio, con los impuestos que correspondan, se muestra antes de pagar.`,
        },
        {
          title: 'Pago',
          body: 'En la app del iPhone, Premium y los supercrush se compran con la compra integrada de Apple y se cobran en tu Apple ID. En Android y en la web, y las entradas en cualquier dispositivo, se pagan con Stripe, en su página segura. No guardamos los datos de tu tarjeta y recibirás el justificante por correo.',
        },
        {
          title: 'Premium mensual',
          body: 'Se renueva cada mes hasta que la canceles. Si la compraste en el iPhone, se cancela en Ajustes › tu nombre › Suscripciones, al menos 24 horas antes de que acabe el mes; si no, desde el perfil. Al cancelar, sigues teniendo Premium hasta el final del periodo pagado y no se vuelve a cobrar.',
        },
        {
          title: 'Premium para una fiesta y supercrush',
          body: 'El Premium para una fiesta sólo vale en esa fiesta y termina una hora después de su final. Los supercrush comprados no caducan mientras tengas la cuenta.',
        },
        {
          title: 'Derecho de desistimiento',
          body: 'Premium y supercrush son contenido digital que se entrega al momento. Al comprarlos aceptas que empiecen enseguida y, por eso, pierdes el derecho de desistimiento de 14 días (artículo 103.m de la Ley General para la Defensa de los Consumidores). Las entradas son servicios de ocio para una fecha concreta y tampoco tienen derecho de desistimiento (artículo 103.l).',
        },
        {
          title: 'Entradas y mesas',
          body: `Las vende el local que organiza la fiesta, que es quien las cobra a través de su cuenta de Stripe; ${app} actúa como plataforma y puede cobrar al local una comisión. Cada entrada tiene un código QR que se valida una sola vez en la puerta. El local decide el acceso según sus normas (edad, aforo, derecho de admisión) y es quien atiende las devoluciones.`,
        },
        {
          title: 'Devoluciones',
          body: `Si la fiesta se cancela, el local debe devolver el importe de las entradas. Para cualquier otra devolución de una entrada, habla con el local. Las compras hechas con Apple sólo las puede devolver Apple: pídelo en reportaproblem.apple.com. Si hay un cargo que no reconoces o un problema con Premium o supercrush, escribe a ${correo} y lo revisamos.`,
        },
        {
          title: 'Destacar una fiesta',
          body: 'Es un pago único por noche que pone la fiesta en primer lugar en la portada, el mapa y las recomendaciones hasta que termina. Se devuelve si la fiesta no llega a destacarse por un fallo nuestro.',
        },
      ],
    },

    // ---------------------------------------------------------------- locales
    {
      id: 'venues',
      slug: 'locales',
      title: 'Condiciones para locales',
      summary: 'Alta, planes, cobros con Stripe, comisiones, equipo y responsabilidades de los locales.',
      sections: [
        {
          title: 'Alta y verificación',
          body: `Para usar el panel de locales (${panel.replace(/^https?:\/\//, '')}) hay que registrar el establecimiento con su nombre, NIF, dirección y documentación que acredite la titularidad. Revisamos cada alta antes de aprobarla. Al aprobarse, el local tiene 30 días del plan Pro de prueba.`,
        },
        {
          title: 'Planes',
          body: 'Hay un plan gratuito y dos de pago (Pro y Business), con las funciones y límites que se ven en el panel, en Plan. Los planes de pago se cobran por meses y se renuevan solos hasta que se cancelan; al cancelar, el plan sigue hasta el final del periodo pagado y después el local vuelve al plan gratuito.',
        },
        {
          title: 'Venta de entradas',
          body: `Para vender entradas y mesas, el local abre su propia cuenta de Stripe (Stripe Connect) y acepta sus condiciones. El dinero de cada venta va a esa cuenta. ${app} puede quedarse una comisión por entrada, pactada con el local, y repercute la tarifa de procesamiento de Stripe. El local es el vendedor: responde de la fiesta, del acceso, de los impuestos de sus ventas y de las devoluciones.`,
        },
        {
          title: 'Equipo',
          body: 'El propietario puede dar acceso con cuenta a otros propietarios y a seguridad, y crear enlaces sin cuenta para seguridad, camareros y relaciones públicas. El local responde del uso que su equipo haga de esos accesos y debe revocarlos cuando una persona deje de trabajar con él.',
        },
        {
          title: 'Datos de los clientes',
          body: 'El local recibe estadísticas agregadas y, para gestionar la puerta, los nombres de las listas de invitados, las entradas y las alertas de ayuda. Sólo puede usarlos para gestionar sus fiestas, no puede copiarlos a otros sistemas ni usarlos para publicidad sin el consentimiento de cada persona, y debe tratarlos con confidencialidad.',
        },
        {
          title: 'Contenido y fiestas',
          body: 'El local responde de que sus fiestas, carteles, ofertas, sorteos y premios sean veraces y legales, de tener las licencias necesarias, de respetar el aforo y la edad mínima, y de custodiar sus códigos de acceso.',
        },
        {
          title: 'Baja',
          body: `El local puede darse de baja cuando quiera escribiendo a ${correo}. Podemos suspender una cuenta que incumpla estas condiciones o la ley.`,
        },
      ],
    },

    // --------------------------------------------------------- eliminar cuenta
    {
      id: 'delete-account',
      slug: 'eliminar-cuenta',
      title: 'Eliminar tu cuenta',
      summary: `Cómo borrar tu cuenta de ${app} y todos tus datos.`,
      sections: [
        {
          title: 'Desde la app',
          body: 'Abre Perfil, baja hasta el final y pulsa «Eliminar cuenta», debajo de «Cerrar sesión». Escribe ELIMINAR para confirmarlo. La cuenta se borra al momento.',
        },
        {
          title: 'Sin la app',
          body: `Si no puedes entrar, escribe a ${correo} desde el correo de tu cuenta con el asunto «Eliminar cuenta». La borraremos en un plazo máximo de 30 días y te lo confirmaremos.`,
        },
        {
          title: 'Qué se borra',
          body: 'Tu perfil, fotos, ubicación, likes, matches, mensajes, listas de invitados, supercrush sin gastar y el resto de tu actividad.',
        },
        {
          title: 'Qué se conserva',
          body: 'Los pedidos de entradas se quedan en las ventas del local, sin tu nombre. Los justificantes de pago los conserva Stripe durante el plazo que exige la ley (hasta seis años), bloqueados y sin usarlos para nada más. Las estadísticas agregadas de los locales no te identifican.',
        },
        {
          title: 'Antes de borrarla',
          body: 'Si tienes Premium mensual, se cancela en Stripe en ese momento y no se vuelve a cobrar. Si quieres una copia de tus datos, descárgala antes desde Perfil → Privacidad y datos.',
        },
      ],
    },

    // ---------------------------------------------------------------- soporte
    {
      id: 'support',
      slug: 'soporte',
      title: 'Soporte',
      summary: `Cómo contactar con el equipo de ${app}.`,
      sections: [
        {
          title: 'Contacto',
          body: `Escríbenos a ${correo}. Respondemos en un plazo de 48 horas laborables.`,
        },
        {
          title: 'Una emergencia en una fiesta',
          body: 'Usa el botón de ayuda de la app: avisa al momento al personal del local y a tus contactos de confianza. Si hay peligro, llama al 112.',
        },
        {
          title: 'Denunciar a alguien',
          body: 'Con la opción «Denunciar» de su tarjeta en el tablón, de su perfil o del chat. Lo revisamos y, si hace falta, el local puede retirarle el acceso a la fiesta.',
        },
        {
          title: 'Pagos y entradas',
          body: `Para devoluciones de entradas, habla con el local que organiza la fiesta. Para Premium, supercrush o un cargo que no reconoces, escribe a ${correo} con el correo del justificante.`,
        },
        {
          title: 'Locales',
          body: `Si tienes un local y quieres usar ${app}, pide una demo en ${dominio} o escribe a ${correo}.`,
        },
      ],
    },
  ];
};
