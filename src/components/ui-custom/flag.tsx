import { LanguageCode } from '@/i18n';

/**
 * Banderas de los idiomas de la aplicación, dibujadas.
 *
 * Los emoji de bandera no existen en Windows: la fuente del sistema no los
 * trae, así que 🇪🇸 se pinta como las letras «ES» y el selector volvía a no
 * enseñar ninguna bandera. En Android y en iOS sí se ven, pero la aplicación
 * también se usa desde el escritorio y el selector tiene que verse igual en los
 * tres sitios.
 *
 * Son cuatro, así que van dibujadas a mano en lugar de traerse una biblioteca
 * de banderas entera. Nada de imágenes externas: el CSP de la aplicación no las
 * dejaría cargar y además tienen que verse sin conexión.
 *
 * El catalán no tiene bandera en Unicode —no es que falte en algunas
 * plataformas, es que la secuencia no existe—, y ésta es justo la razón por la
 * que se dibujan: aquí sí se puede pintar la senyera.
 */
const flags: Record<LanguageCode, React.ReactNode> = {
  es: (
    <>
      <rect width="60" height="40" fill="#AA151B" />
      <rect y="10" width="60" height="20" fill="#F1BF00" />
    </>
  ),
  en: (
    <>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#FFF" strokeWidth="8" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#C8102E" strokeWidth="4" />
      <path d="M30 0V40M0 20H60" stroke="#FFF" strokeWidth="13" />
      <path d="M30 0V40M0 20H60" stroke="#C8102E" strokeWidth="8" />
    </>
  ),
  de: (
    <>
      <rect width="60" height="40" fill="#000" />
      <rect y="13.33" width="60" height="13.34" fill="#DD0000" />
      <rect y="26.67" width="60" height="13.33" fill="#FFCE00" />
    </>
  ),
  // Senyera: nueve franjas, cuatro rojas sobre fondo amarillo.
  ca: (
    <>
      <rect width="60" height="40" fill="#FCDD09" />
      {[1, 3, 5, 7].map((n) => (
        <rect key={n} y={n * (40 / 9)} width="60" height={40 / 9} fill="#DA121A" />
      ))}
    </>
  ),
};

interface FlagProps {
  code: LanguageCode;
  /** Alto en píxeles; el ancho sale de la proporción 3:2. */
  size?: number;
  className?: string;
}

const Flag: React.FC<FlagProps> = ({ code, size = 14, className }) => (
  <svg
    viewBox="0 0 60 40"
    width={size * 1.5}
    height={size}
    aria-hidden
    focusable="false"
    className={`shrink-0 rounded-[2px] ${className ?? ''}`}
  >
    {flags[code]}
    {/* Un borde tenue para que el blanco y el amarillo no se derramen sobre
        fondos claros ni desaparezcan sobre los oscuros. */}
    <rect
      width="60"
      height="40"
      fill="none"
      stroke="rgba(0,0,0,0.25)"
      strokeWidth="2"
      rx="2"
    />
  </svg>
);

export default Flag;
