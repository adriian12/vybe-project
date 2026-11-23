import { describe, expect, it } from 'vitest';
import { parseTicketOcr, OcrLine } from './ticket-import';
import captura from './__fixtures__/captura-fourvenues-ocr.json';

// Lectura real (Tesseract, imagen invertida y al doble) de la captura de una
// entrada de Fourvenues desde el navegador del móvil; titular y contacto inventados.
describe('parseTicketOcr (captura de Fourvenues)', () => {
  const t = parseTicketOcr(captura.lines as OcrLine[], captura.width, 'FBMS2VXB8');

  it('lee la fecha, la hora y el fin de la franja', () => {
    expect(t.startsLocal).toBe('2026-11-21T18:00');
    expect(t.endsLabel).toBe('23:45');
    expect(t.kind).toBe('Entrada');
  });

  it('lee la sala, el nombre de la fiesta y la plataforma', () => {
    expect(t.source).toBe('fourvenues');
    expect(t.organizer).toBe('AMOK');
    expect(t.eventName).toBe('El Tardeo de Reggaeton Viejo');
  });

  it('lee código, personas, tarifa, precio, titular y dirección (sin correo ni teléfono)', () => {
    expect(t.code).toBe('FBMS2VXB8');
    expect(t.people).toBe(1);
    expect(t.ticketType).toBe('Early Access');
    expect(t.priceCents).toBe(1582);
    expect(t.holderName).toBe('Laura Ferrer Pons');
    expect(t.address).toContain('Camí Can Capó, 4, 07199 Palma');
    expect(t.details ?? '').not.toMatch(/correo|@|\+34/);
  });
});

describe('parseTicketOcr (lectura peor: sin franja y sin «powered»)', () => {
  // Como sale en algunos navegadores: la franja de la fecha no se lee y la
  // cabecera pierde «powered».
  const lineas = (captura.lines as OcrLine[])
    .filter((l) => !/ENTRADA S[ÁA]B/i.test(l.text))
    .map((l) => (/powered by/i.test(l.text) ? { ...l, text: 'Y AMOK by 4 fourvenues' } : l));
  const t = parseTicketOcr(lineas, captura.width, 'FBMS2VXB8');

  it('saca igualmente la sala y el nombre (la fecha la pone la fiesta asociada)', () => {
    expect(t.organizer).toBe('AMOK');
    expect(t.eventName).toBe('El Tardeo de Reggaeton Viejo');
    expect(t.startsLocal).toBeNull();
  });
});
