import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * El aviso de fotos que no pasan la revisión: dice cuáles han fallado (una,
 * varias o todas), por qué, y la lista de requisitos. La foto de la noche añade
 * que tiene que ser de la cámara.
 */

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) =>
        opts ? `${key}(${Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',')})` : key,
    }),
  };
});

import PhotoRequirementsDialog from './photo-requirements-dialog';

const pintar = (props: Partial<Parameters<typeof PhotoRequirementsDialog>[0]>) =>
  render(
    <PhotoRequirementsDialog open onOpenChange={() => undefined} failed={[]} total={3} {...props} />,
  );

describe('aviso de requisitos de las fotos', () => {
  it('nombra las imágenes que fallan, con su motivo', () => {
    pintar({ failed: [{ index: 1, reason: 'no_face' }, { index: 3, reason: 'many_faces' }] });
    expect(screen.getByText('photoCheck.titleSome(count=2,list=1 photoCheck.and 3)')).toBeInTheDocument();
    expect(screen.getByText(/photoCheck.reasons.no_face/)).toBeInTheDocument();
    expect(screen.getByText(/photoCheck.reasons.many_faces/)).toBeInTheDocument();
    expect(screen.getByText('photoCheck.requirements.face')).toBeInTheDocument();
  });

  it('dice «ninguna» cuando fallan todas', () => {
    pintar({ failed: [1, 2, 3].map((index) => ({ index, reason: 'nudity' })) });
    expect(screen.getByText('photoCheck.titleAll')).toBeInTheDocument();
  });

  it('la foto de la noche pide además la cámara', () => {
    pintar({ failed: [{ index: 1, reason: 'no_face' }], total: 1, kind: 'event' });
    expect(screen.getByText('photoCheck.titleSingle')).toBeInTheDocument();
    expect(screen.getByText('photoCheck.requirements.cameraNow')).toBeInTheDocument();
  });

  it('si la revisión no responde lo dice así, no como foto mala', () => {
    pintar({ failed: [{ index: 1, reason: 'unavailable' }], total: 1 });
    expect(screen.getByText('photoCheck.unavailableTitle')).toBeInTheDocument();
    expect(screen.getByText('photoCheck.unavailableBody')).toBeInTheDocument();
  });
});
