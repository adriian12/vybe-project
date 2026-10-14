import { describe, expect, it } from 'vitest';
import { fechaIso, hora24, parseTicket } from './ticket-import';
// Texto de dos entradas reales de Fourvenues (pdf.js), con el titular cambiado.
import fixtures from './__fixtures__/fourvenues.json';

const FOURVENUES = 'Si quieres conocer las condiciones accede a fourvenues.com/terms-and-conditions';

describe('lectura de entradas de Fourvenues', () => {
  it('lee una entrada de lista para varias personas', () => {
    const r = parseTicket(fixtures.lista.items, fixtures.lista.width, 'TST4LISTA', FOURVENUES);
    expect(r.source).toBe('fourvenues');
    expect(r.code).toBe('TST4LISTA');
    expect(r.organizer).toBe('Zar Society');
    expect(r.kind).toBe('Lista');
    expect(r.eventName).toBe('Tardeo Canalla by Zar Society');
    expect(r.startsLocal).toBe('2026-10-17T18:00');
    expect(r.endsLabel).toBe('Cierre');
    expect(r.people).toBe(5);
    expect(r.ticketType).toBe('LISTA');
    expect(r.details).toContain('Free pass o 15€ x 2 consumiciones');
    expect(r.details).toContain('Después de las 19:30h');
    expect(r.holderName).toBe('Marta López');
    expect(r.address).toBe('Av. de Gabriel Roca, 29, 07014 Palma, Illes Balears, España');
  });

  it('lee una entrada con precio y un nombre de evento en dos líneas', () => {
    const r = parseTicket(fixtures.entrada.items, fixtures.entrada.width, 'TST9ENTRA', FOURVENUES);
    expect(r.organizer).toBe('PALMA EVENTS');
    expect(r.kind).toBe('Entrada');
    expect(r.eventName).toBe('Las Tardes de Mar Salada | Farándula Club x Tardet');
    expect(r.startsLocal).toBe('2026-10-17T17:00');
    expect(r.people).toBe(1);
    expect(r.ticketType).toBe('Entrada por Lista');
    expect(r.priceCents).toBe(0);
    expect(r.details?.startsWith('En Lista - Gratis de 17:00h')).toBe(true);
    expect(r.details).not.toMatch(/Tasas e impuestos|Precio:/);
    // El titular sale sin teléfono ni correo.
    expect(r.holderName).toBe('Marta López');
    expect(r.address).toContain('Muelle Pelaires');
  });

  it('sin QR legible, toma el código impreso bajo el QR', () => {
    const r = parseTicket(fixtures.entrada.items, fixtures.entrada.width, '', FOURVENUES);
    expect(r.code).toBe('TST9ENTRA');
  });

  it('de otro PDF sólo se queda con el QR', () => {
    const r = parseTicket([{ str: 'Concierto', x: 10, y: 10, h: 30, w: 100 }], 600, 'https://ejemplo.com/t/123', '');
    expect(r.source).toBe('other');
    expect(r.qrText).toBe('https://ejemplo.com/t/123');
    expect(r.eventName).toBeNull();
  });
});

describe('fechas y horas', () => {
  it('convierte horas de 12 a 24', () => {
    expect(hora24('6:00 PM')).toBe('18:00');
    expect(hora24('12:30 AM')).toBe('00:30');
    expect(hora24('23:15')).toBe('23:15');
    expect(hora24('CIERRE')).toBeNull();
  });

  it('lee fechas en español e inglés', () => {
    expect(fechaIso('SÁB. 17 DE OCT. DE 2026')).toBe('2026-10-17');
    expect(fechaIso('SAT, DEC 5, 2026')).toBe('2026-12-05');
  });
});
