import uber from '@/assets/go-home/uber.png';
import cabify from '@/assets/go-home/cabify.png';

/**
 * Las marcas de Uber y Cabify en la hoja «Volver a casa», sólo para señalar a
 * qué app lleva cada botón. Salen de los logos de la raíz del proyecto
 * (`uber.webp`, `cabify.png` sobre el morado de `cabify2.jpeg`), a 132 px.
 */

const Logo = ({ src }: { src: string }) => (
  <img src={src} alt="" aria-hidden className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />
);

export const UberLogo = () => <Logo src={uber} />;

export const CabifyLogo = () => <Logo src={cabify} />;
