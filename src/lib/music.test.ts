import { describe, expect, it } from 'vitest';
import { musicaDe } from './music';

describe('musicaDe', () => {
  it('reparte los géneros que traen las fiestas', () => {
    const casos: [string, string][] = [
      ['Techno', 'techno'],
      ['Hard Techno', 'techno'],
      ['Acid Techno', 'techno'],
      ['Hard Groove', 'techno'],
      ['Minimal', 'techno'],
      ['House', 'electronica'],
      ['Tech House', 'electronica'],
      ['Latin House', 'electronica'],
      ['Electronica', 'electronica'],
      ['Electrónica', 'electronica'],
      ['Drum & Bass', 'electronica'],
      ['Disco', 'electronica'],
      ['Reggaeton', 'reggaeton'],
      ['Latin', 'reggaeton'],
      ['Guaracha', 'reggaeton'],
      ['Salsa / Bachata', 'reggaeton'],
      ['Comercial', 'comercial'],
      ['Hits', 'comercial'],
      ['90s - 00s', 'comercial'],
      ["80's", 'comercial'],
      ['Pop', 'comercial'],
      ['Hip-Hop', 'otras'],
      ['Funk / Soul', 'otras'],
      ['Post-Punk', 'otras'],
    ];
    for (const [genero, esperado] of casos) expect([genero, musicaDe(genero)]).toEqual([genero, esperado]);
  });

  it('sin género es «otras»', () => {
    expect(musicaDe(null)).toBe('otras');
    expect(musicaDe('  ')).toBe('otras');
  });
});
