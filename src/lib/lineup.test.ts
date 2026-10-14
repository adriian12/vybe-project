import { describe, expect, it } from 'vitest';
import { artistInitials, cleanLineup, instagramHandle, parseLineup } from './lineup';

describe('line-up', () => {
  it('saca el usuario de Instagram de cualquier forma de escribirlo', () => {
    expect(instagramHandle('@dj.martin')).toBe('dj.martin');
    expect(instagramHandle('https://www.instagram.com/dj.martin/?hl=es')).toBe('dj.martin');
    expect(instagramHandle('instagram.com/dj_martin')).toBe('dj_martin');
    expect(instagramHandle('  martin  ')).toBe('martin');
    expect(instagramHandle('no vale!')).toBeNull();
    expect(instagramHandle('')).toBeNull();
  });

  it('limpia antes de guardar: sin filas vacías y con los campos recortados', () => {
    expect(
      cleanLineup([
        { name: '  Andrea Oliva ', time: ' 01:30 – 03:00 ', instagram: '@andreaoliva' },
        { name: '   ', time: '23:00' },
        { name: 'Mike TEX', time: '', instagram: 'enlace roto!' },
      ]),
    ).toEqual([
      { name: 'Andrea Oliva', time: '01:30 – 03:00', instagram: 'andreaoliva' },
      { name: 'Mike TEX', time: null, instagram: null },
    ]);
  });

  it('lee lo que llega de la base de datos aunque venga incompleto', () => {
    expect(parseLineup([{ name: 'Manu Sánchez' }, { foo: 1 }, null, { name: 'X', instagram: '@x' }])).toEqual([
      { name: 'Manu Sánchez', time: null, instagram: null },
      { name: 'X', time: null, instagram: 'x' },
    ]);
    expect(parseLineup(null)).toEqual([]);
  });

  it('iniciales para el círculo sin foto', () => {
    expect(artistInitials('Dj. Martin K.')).toBe('MK');
    expect(artistInitials('Andrea Oliva')).toBe('AO');
    expect(artistInitials('Amelie')).toBe('AM');
  });
});
