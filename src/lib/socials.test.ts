import { describe, expect, it } from 'vitest';
import { normalizeSocial, socialLabel, socialUrl } from './socials';

describe('normalizeSocial', () => {
  it('acepta la arroba, el usuario o el enlace', () => {
    expect(normalizeSocial('instagram', '@sala.aurora')).toBe('sala.aurora');
    expect(normalizeSocial('instagram', 'https://www.instagram.com/sala.aurora/?hl=es')).toBe('sala.aurora');
    expect(normalizeSocial('x', 'twitter.com/SalaAurora')).toBe('SalaAurora');
    expect(normalizeSocial('x', 'https://x.com/sala_aurora/status/123')).toBe('sala_aurora');
    expect(normalizeSocial('tiktok', 'https://www.tiktok.com/@sala.aurora?lang=es')).toBe('sala.aurora');
    expect(normalizeSocial('tiktok', '@sala.aurora')).toBe('sala.aurora');
  });

  it('YouTube guarda «@canal» o «channel/UC…»', () => {
    expect(normalizeSocial('youtube', 'salaaurora')).toBe('@salaaurora');
    expect(normalizeSocial('youtube', 'https://youtube.com/@salaaurora/videos')).toBe('@salaaurora');
    expect(normalizeSocial('youtube', 'https://www.youtube.com/channel/UC1234567890abcdefghijkl')).toBe(
      'channel/UC1234567890abcdefghijkl',
    );
  });

  it('vacío es null e inválido es undefined', () => {
    expect(normalizeSocial('x', '  ')).toBeNull();
    expect(normalizeSocial('x', 'nombre con espacios')).toBeUndefined();
    expect(normalizeSocial('x', 'demasiadolargoparax')).toBeUndefined();
    expect(normalizeSocial('tiktok', 'a')).toBeUndefined();
  });
});

describe('socialUrl y socialLabel', () => {
  it('arma el enlace de cada red', () => {
    expect(socialUrl('instagram', 'sala')).toBe('https://instagram.com/sala');
    expect(socialUrl('x', 'sala')).toBe('https://x.com/sala');
    expect(socialUrl('youtube', '@sala')).toBe('https://www.youtube.com/@sala');
    expect(socialUrl('tiktok', 'sala')).toBe('https://www.tiktok.com/@sala');
    expect(socialLabel('tiktok', 'sala')).toBe('@sala');
    expect(socialLabel('youtube', '@sala')).toBe('@sala');
    expect(socialLabel('x', null)).toBe('');
  });
});
