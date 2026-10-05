/**
 * Textos de los avisos push, en los cuatro idiomas de la app.
 *
 * Los compone el servidor porque el aviso llega con la app cerrada: no hay
 * i18next que traduzca nada. El idioma es el de `profiles.locale`; si falta o
 * no es uno de los cuatro, español.
 */

type Locale = 'es' | 'en' | 'de' | 'ca';

/** Los niveles de `vibe_level_for()` (migración 040). */
export type VibeLevel = 'quiet' | 'lively' | 'almost_full' | 'full';

export const pickLocale = (value: unknown): Locale => {
  const base = typeof value === 'string' ? value.slice(0, 2).toLowerCase() : '';
  return base === 'en' || base === 'de' || base === 'ca' ? base : 'es';
};

interface Texts {
  match: (name: string) => { title: string; body: string };
  vybeCheck: (name: string) => { title: string; body: string };
  doorsOpen: (event: string, venue: string) => { title: string; body: string };
  fillingUp: (event: string, inside: number) => { title: string; body: string };
  /** Por el ambiente que da el local: nunca su cifra. */
  fillingUpVibe: (event: string, level: VibeLevel) => { title: string; body: string };
  endingSoon: (event: string, vybes: number) => { title: string; body: string };
  /** Una hora antes del final: los me gusta sin responder caducan con la fiesta (098). */
  likesExpiring: (event: string, likes: number) => { title: string; body: string };
  raffleCreated: (event: string, prize: string, time: string | null) => { title: string; body: string };
  raffleWon: (event: string, prize: string) => { title: string; body: string };
  raffleWinner: (event: string, prize: string, winner: string) => { title: string; body: string };
  newEvent: (venue: string, event: string, when: string) => { title: string; body: string };
  photosPending: (count: number) => { title: string; body: string };
  /** Alguien pide ayuda dentro de una fiesta: al equipo del local y a administración. */
  sosHelp: (name: string, event: string) => { title: string; body: string };
  /** Una denuncia dentro de la fiesta (101): al negocio, a Seguridad o a administración. */
  reportReceived: (name: string, event: string) => { title: string; body: string };
  /** A quien han expulsado de la fiesta tras una denuncia (101). */
  expelled: (event: string) => { title: string; body: string };
}

const TEXTS: Record<Locale, Texts> = {
  es: {
    match: (name) => ({
      title: '¡Crush!',
      body: `A ${name} también le gustas. Escríbele antes de que acabe la noche.`,
    }),
    vybeCheck: (name) => ({
      title: '¡Flechazo!',
      body: `Tú y ${name} os habéis dado un súper like. Di hola.`,
    }),
    doorsOpen: (event, venue) => ({
      title: `${event} ha empezado`,
      body: `${venue} ya está abierto. Dijiste que ibas: no te quedes en casa.`,
    }),
    fillingUp: (event, inside) => ({
      title: `Ya hay ${inside} personas con Fiestea en ${event}`,
      body: '¿Te lo vas a perder? Acércate y escanea el código para entrar.',
    }),
    fillingUpVibe: (event, level) => ({
      title:
        level === 'full'
          ? `${event} está lleno`
          : level === 'almost_full'
            ? `${event} está casi lleno`
            : `${event} se está animando`,
      body:
        level === 'full' || level === 'almost_full'
          ? 'Si vas a ir, date prisa: queda poco sitio.'
          : '¿Te lo vas a perder? Acércate y escanea el código para entrar.',
    }),
    endingSoon: (event, vybes) => ({
      title: `${event} termina en 30 minutos`,
      body:
        vybes > 0
          ? `Tienes ${vybes} ${vybes === 1 ? 'crush' : 'crushes'} esta noche. Escribid y pulsad «Conservar» o la conversación caducará.`
          : 'Última media hora: aprovecha para conectar con alguien.',
    }),
    likesExpiring: (event, likes) => ({
      title: likes === 1 ? 'Tienes 1 me gusta sin responder' : `Tienes ${likes} me gusta sin responder`,
      body: `${event} termina en una hora y se borran con ella. Devuélvelos ahora y será crush.`,
    }),
    raffleCreated: (event, prize, time) => ({
      title: `Sorteo en ${event}`,
      body: time
        ? `${prize} · a las ${time}. Para participar, sigue dentro.`
        : `${prize}. Para participar, sigue dentro.`,
    }),
    raffleWon: (event, prize) => ({
      title: '¡Has ganado el sorteo!',
      body: `Te ha tocado «${prize}» en ${event}. Ve a Ofertas → Sorteos y enséñalo en la barra.`,
    }),
    raffleWinner: (event, prize, winner) => ({
      title: `Sorteo de ${event}`,
      body: `El ganador de «${prize}» ha sido ${winner}.`,
    }),
    newEvent: (venue, event, when) => ({
      title: `${venue} tiene nueva fiesta`,
      body: `${event} · ${when}. Márcala con «voy a ir» para no perdértela.`,
    }),
    photosPending: (count) => ({
      title: 'Tienes imágenes por revisar',
      body: `${count} foto(s) esperan revisión manual: la revisión automática no ha respondido.`,
    }),
    reportReceived: (name, event) => ({
      title: `Denuncia en ${event}`,
      body: `Han denunciado a ${name}. Revísalo y, si hace falta, expúlsale de la fiesta.`,
    }),
    expelled: (event) => ({
      title: `Ya no estás en ${event}`,
      body: 'El negocio te ha retirado el acceso a esta fiesta tras una denuncia.',
    }),
    sosHelp: (name, event) => ({
      title: event ? `${name} pide ayuda en ${event}` : `${name} pide ayuda`,
      body: 'Emergencia dentro de la fiesta. Abre Puerta en el panel del local.',
    }),
  },
  en: {
    match: (name) => ({
      title: 'Crush!',
      body: `${name} likes you too. Say hi before the night is over.`,
    }),
    vybeCheck: (name) => ({
      title: 'Flechazo!',
      body: `You and ${name} super-liked each other. Say hi.`,
    }),
    doorsOpen: (event, venue) => ({
      title: `${event} has started`,
      body: `${venue} is open. You said you were going: don't stay home.`,
    }),
    fillingUp: (event, inside) => ({
      title: `${inside} people on Fiestea are already at ${event}`,
      body: 'Going to miss it? Head over and scan the code to get in.',
    }),
    fillingUpVibe: (event, level) => ({
      title:
        level === 'full'
          ? `${event} is full`
          : level === 'almost_full'
            ? `${event} is almost full`
            : `${event} is getting lively`,
      body:
        level === 'full' || level === 'almost_full'
          ? "If you're going, hurry: there's not much room left."
          : 'Going to miss it? Head over and scan the code to get in.',
    }),
    endingSoon: (event, vybes) => ({
      title: `${event} ends in 30 minutes`,
      body:
        vybes > 0
          ? `You have ${vybes} ${vybes === 1 ? 'crush' : 'crushes'} tonight. Message them and both tap "Keep" or the chat will expire.`
          : 'Last half hour: make the most of it and connect with someone.',
    }),
    likesExpiring: (event, likes) => ({
      title: likes === 1 ? 'You have 1 like waiting' : `You have ${likes} likes waiting`,
      body: `${event} ends in an hour and they disappear with it. Like them back now to make it a crush.`,
    }),
    raffleCreated: (event, prize, time) => ({
      title: `Raffle at ${event}`,
      body: time ? `${prize} · at ${time}. Stay inside to take part.` : `${prize}. Stay inside to take part.`,
    }),
    raffleWon: (event, prize) => ({
      title: 'You won the raffle!',
      body: `You won «${prize}» at ${event}. Go to Offers → Raffles and show it at the bar.`,
    }),
    raffleWinner: (event, prize, winner) => ({
      title: `${event} raffle`,
      body: `The winner of «${prize}» is ${winner}.`,
    }),
    newEvent: (venue, event, when) => ({
      title: `New party at ${venue}`,
      body: `${event} · ${when}. Tap "I'm going" so you don't miss it.`,
    }),
    photosPending: (count) => ({
      title: 'You have images to review',
      body: `${count} photo(s) are waiting for manual review: the automatic check didn't respond.`,
    }),
    reportReceived: (name, event) => ({
      title: `Report at ${event}`,
      body: `${name} has been reported. Check it and remove them from the party if needed.`,
    }),
    expelled: (event) => ({
      title: `You're no longer at ${event}`,
      body: 'The venue has removed your access to this party after a report.',
    }),
    sosHelp: (name, event) => ({
      title: event ? `${name} needs help at ${event}` : `${name} needs help`,
      body: 'Emergency inside the party. Open Door in the venue panel.',
    }),
  },
  de: {
    match: (name) => ({
      title: 'Crush!',
      body: `${name} mag dich auch. Schreib, bevor die Nacht vorbei ist.`,
    }),
    vybeCheck: (name) => ({
      title: 'Flechazo!',
      body: `Du und ${name} habt euch ein Super-Like gegeben. Sag Hallo.`,
    }),
    doorsOpen: (event, venue) => ({
      title: `${event} hat begonnen`,
      body: `${venue} ist geöffnet. Du wolltest hin: bleib nicht zu Hause.`,
    }),
    fillingUp: (event, inside) => ({
      title: `Schon ${inside} Leute mit Fiestea bei ${event}`,
      body: 'Willst du das verpassen? Komm vorbei und scanne den Code.',
    }),
    fillingUpVibe: (event, level) => ({
      title:
        level === 'full'
          ? `${event} ist voll`
          : level === 'almost_full'
            ? `${event} ist fast voll`
            : `Bei ${event} wird es voller`,
      body:
        level === 'full' || level === 'almost_full'
          ? 'Wenn du hinwillst, beeil dich: Es ist kaum noch Platz.'
          : 'Willst du das verpassen? Komm vorbei und scanne den Code.',
    }),
    endingSoon: (event, vybes) => ({
      title: `${event} endet in 30 Minuten`,
      body:
        vybes > 0
          ? `Du hast heute ${vybes} ${vybes === 1 ? 'Crush' : 'Crushes'}. Schreibt euch und tippt beide auf „Behalten", sonst läuft der Chat ab.`
          : 'Letzte halbe Stunde: nutze sie, um jemanden kennenzulernen.',
    }),
    likesExpiring: (event, likes) => ({
      title: likes === 1 ? 'Du hast 1 unbeantwortetes Like' : `Du hast ${likes} unbeantwortete Likes`,
      body: `${event} endet in einer Stunde und sie verschwinden mit der Party. Gib sie jetzt zurück und es wird ein Crush.`,
    }),
    raffleCreated: (event, prize, time) => ({
      title: `Verlosung bei ${event}`,
      body: time
        ? `${prize} · um ${time}. Bleib drinnen, um mitzumachen.`
        : `${prize}. Bleib drinnen, um mitzumachen.`,
    }),
    raffleWon: (event, prize) => ({
      title: 'Du hast die Verlosung gewonnen!',
      body: `Du hast «${prize}» bei ${event} gewonnen. Geh zu Angebote → Verlosungen und zeig es an der Bar.`,
    }),
    raffleWinner: (event, prize, winner) => ({
      title: `Verlosung bei ${event}`,
      body: `Gewonnen hat «${prize}»: ${winner}.`,
    }),
    newEvent: (venue, event, when) => ({
      title: `Neue Party bei ${venue}`,
      body: `${event} · ${when}. Markier „Ich gehe hin“, damit du sie nicht verpasst.`,
    }),
    photosPending: (count) => ({
      title: 'Du hast Bilder zu prüfen',
      body: `${count} Foto(s) warten auf manuelle Prüfung: Die automatische Prüfung hat nicht geantwortet.`,
    }),
    reportReceived: (name, event) => ({
      title: `Meldung bei ${event}`,
      body: `${name} wurde gemeldet. Prüfe es und entferne die Person bei Bedarf von der Party.`,
    }),
    expelled: (event) => ({
      title: `Du bist nicht mehr bei ${event}`,
      body: 'Das Lokal hat dir nach einer Meldung den Zugang zu dieser Party entzogen.',
    }),
    sosHelp: (name, event) => ({
      title: event ? `${name} braucht Hilfe bei ${event}` : `${name} braucht Hilfe`,
      body: 'Notfall auf der Party. Öffne „Tür“ im Panel des Lokals.',
    }),
  },
  ca: {
    match: (name) => ({
      title: 'Crush!',
      body: `A ${name} també li agrades. Escriu-li abans que s'acabi la nit.`,
    }),
    vybeCheck: (name) => ({
      title: 'Flechazo!',
      body: `Tu i ${name} us heu fet un súper like. Digues hola.`,
    }),
    doorsOpen: (event, venue) => ({
      title: `${event} ha començat`,
      body: `${venue} ja és obert. Vas dir que hi anaves: no et quedis a casa.`,
    }),
    fillingUp: (event, inside) => ({
      title: `Ja hi ha ${inside} persones amb Fiestea a ${event}`,
      body: "T'ho perdràs? Acosta't i escaneja el codi per entrar.",
    }),
    fillingUpVibe: (event, level) => ({
      title:
        level === 'full'
          ? `${event} és ple`
          : level === 'almost_full'
            ? `${event} és gairebé ple`
            : `${event} s'està animant`,
      body:
        level === 'full' || level === 'almost_full'
          ? "Si hi vas, afanya-t'hi: queda poc lloc."
          : "T'ho perdràs? Acosta't i escaneja el codi per entrar.",
    }),
    endingSoon: (event, vybes) => ({
      title: `${event} acaba d'aquí a 30 minuts`,
      body:
        vybes > 0
          ? `Tens ${vybes} ${vybes === 1 ? 'crush' : 'crushes'} aquesta nit. Escriviu-vos i premeu «Conservar» o la conversa caducarà.`
          : 'Darrera mitja hora: aprofita per connectar amb algú.',
    }),
    likesExpiring: (event, likes) => ({
      title: likes === 1 ? 'Tens 1 m’agrada sense respondre' : `Tens ${likes} m’agrada sense respondre`,
      body: `${event} acaba d’aquí a una hora i s’esborren amb ella. Torna’ls ara i serà crush.`,
    }),
    raffleCreated: (event, prize, time) => ({
      title: `Sorteig a ${event}`,
      body: time
        ? `${prize} · a les ${time}. Per participar, queda't a dins.`
        : `${prize}. Per participar, queda't a dins.`,
    }),
    raffleWon: (event, prize) => ({
      title: 'Has guanyat el sorteig!',
      body: `T'ha tocat «${prize}» a ${event}. Ves a Ofertes → Sortejos i ensenya-ho a la barra.`,
    }),
    raffleWinner: (event, prize, winner) => ({
      title: `Sorteig de ${event}`,
      body: `El guanyador de «${prize}» ha estat ${winner}.`,
    }),
    newEvent: (venue, event, when) => ({
      title: `${venue} té festa nova`,
      body: `${event} · ${when}. Marca «hi vaig» per no perdre-te-la.`,
    }),
    photosPending: (count) => ({
      title: 'Tens imatges per revisar',
      body: `${count} foto(s) esperen revisió manual: la revisió automàtica no ha respost.`,
    }),
    reportReceived: (name, event) => ({
      title: `Denúncia a ${event}`,
      body: `Han denunciat ${name}. Revisa-ho i, si cal, expulsa'l de la festa.`,
    }),
    expelled: (event) => ({
      title: `Ja no ets a ${event}`,
      body: "El negoci t'ha retirat l'accés a aquesta festa després d'una denúncia.",
    }),
    sosHelp: (name, event) => ({
      title: event ? `${name} demana ajuda a ${event}` : `${name} demana ajuda`,
      body: 'Emergència dins la festa. Obre Porta al panell del local.',
    }),
  },
};

export const pushTexts = (locale: unknown): Texts => TEXTS[pickLocale(locale)];
