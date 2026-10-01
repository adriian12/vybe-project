import { describe, expect, it } from 'vitest';
import { slugFichero, toCsv } from './csv';

describe('toCsv', () => {
  it('separa con punto y coma y escapa comillas', () => {
    expect(toCsv([['Nombre', 'Nota'], ['Ana "la jefa"', null]])).toBe('"Nombre";"Nota"\r\n"Ana ""la jefa""";""');
  });

  it('neutraliza las fórmulas', () => {
    expect(toCsv([['=HYPERLINK("x")', '+34 600', '-1', '@SUM(A1)', 'normal']])).toBe(
      `"'=HYPERLINK(""x"")";"'+34 600";"'-1";"'@SUM(A1)";"normal"`,
    );
  });
});

describe('slugFichero', () => {
  it('quita acentos y símbolos', () => {
    expect(slugFichero('Sesión «Aurora» · 3 Oct')).toBe('sesion-aurora-3-oct');
    expect(slugFichero('***')).toBe('export');
  });
});
