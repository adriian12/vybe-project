import { CSSProperties, ElementType, ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Orden dentro de un grupo: retrasa la entrada 45 ms por posición. */
  index?: number;
  as?: ElementType;
  id?: string;
}

/**
 * Aparece cuando entra en pantalla. Sólo una vez: volver a animar al subir
 * distrae más de lo que ayuda.
 */
const Reveal = ({ children, className, index = 0, as: Tag = 'div', id }: RevealProps) => {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      data-visible={visible}
      className={cn('reveal', className)}
      style={{ '--i': index } as CSSProperties}
    >
      {children}
    </Tag>
  );
};

export default Reveal;
