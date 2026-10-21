import { describe, expect, it } from 'vitest';
import { agrupar, clave, mismaFiesta } from './scan-groups';

const ev = (id: string, source: string, title: string, startAt: string, placeName: string | null = null) => ({
  id,
  source,
  title,
  startAt,
  placeName,
});

describe('escáner: misma fiesta en varias webs', () => {
  it('normaliza nombres sin acentos ni signos', () => {
    expect(clave('SÁBADO: Halloween #CUENCAclub')).toBe('sabadohalloweencuencaclub');
  });

  it('mismo nombre y misma noche en webs distintas', () => {
    const a = ev('1', 'xceed', 'Halloween Party', '2026-10-31T22:00:00Z');
    const b = ev('2', 'ra', 'HALLOWEEN party!', '2026-10-31T23:30:00Z');
    expect(mismaFiesta(a, b)).toBe(true);
  });

  it('un nombre dentro del otro', () => {
    const a = ev('1', 'xceed', 'Neotika', '2026-10-21T21:59:00Z');
    const b = ev('2', 'ra', 'Neotika presents Hard Techno', '2026-10-21T22:00:00Z');
    expect(mismaFiesta(a, b)).toBe(true);
  });

  it('misma sala y hora parecida aunque el nombre cambie', () => {
    const a = ev('1', 'xceed', 'Viernes', '2026-10-30T22:59:00Z', 'Cuenca Club');
    const b = ev('2', 'ra', 'Pre-Halloween', '2026-10-30T23:30:00Z', 'Cuenca Club');
    expect(mismaFiesta(a, b)).toBe(true);
  });

  it('no junta noches distintas ni la misma web', () => {
    const a = ev('1', 'xceed', 'Fiesta', '2026-10-30T22:00:00Z', 'Sala');
    expect(mismaFiesta(a, ev('2', 'ra', 'Fiesta', '2026-10-31T22:00:00Z', 'Sala'))).toBe(false);
    expect(mismaFiesta(a, ev('3', 'xceed', 'Fiesta', '2026-10-30T22:00:00Z', 'Sala'))).toBe(false);
  });

  it('agrupa y deja sueltas las demás', () => {
    const grupos = agrupar([
      ev('1', 'xceed', 'Halloween Party', '2026-10-31T22:00:00Z'),
      ev('2', 'ra', 'Halloween Party', '2026-10-31T22:30:00Z'),
      ev('3', 'ra', 'Otra fiesta', '2026-10-31T22:00:00Z'),
    ]);
    expect(grupos.map((g) => g.map((e) => e.id))).toEqual([['1', '2'], ['3']]);
  });
});
