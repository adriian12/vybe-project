import { describe, expect, it } from 'vitest';
import type { TicketOrder, TicketSale } from '@/services/tickets';
import { dailySales, saleState, ticketStats } from './ticket-stats';

const venta = (over: Partial<TicketSale> = {}): TicketSale => ({
  id: 't1',
  kind: 'entry',
  name: 'General',
  description: null,
  priceCents: 1500,
  capacity: 100,
  guests: null,
  minSpendCents: null,
  maxPerOrder: 6,
  active: true,
  sold: 10,
  used: 4,
  revenueCents: 12000,
  minAge: null,
  dressCode: null,
  salesStartAt: null,
  salesEndAt: null,
  comps: 2,
  ...over,
});

const pedido = (over: Partial<TicketOrder> = {}): TicketOrder => ({
  id: 'o1',
  buyer: 'Ana',
  typeName: 'General',
  kind: 'entry',
  quantity: 2,
  amountCents: 3000,
  netCents: 2700,
  status: 'paid',
  paidAt: '2026-10-01T10:00:00Z',
  refundedAt: null,
  used: 0,
  refundable: true,
  buyerEmail: 'ana@x.es',
  source: 'online',
  note: null,
  typeId: 't1',
  ...over,
});

describe('ticketStats', () => {
  it('separa invitaciones de ventas y suma lo cobrado', () => {
    const s = ticketStats(
      [venta()],
      [
        pedido(),
        pedido({ id: 'o2', amountCents: 6000, netCents: 5400, quantity: 4 }),
        pedido({ id: 'o3', source: 'comp', amountCents: 0, netCents: 0, quantity: 2 }),
        pedido({ id: 'o4', status: 'refunded', amountCents: 1500 }),
      ],
    );
    expect(s.sold).toBe(8);
    expect(s.comps).toBe(2);
    expect(s.grossCents).toBe(9000);
    expect(s.netCents).toBe(8100);
    expect(s.paidOrders).toBe(2);
    expect(s.avgOrderCents).toBe(4500);
    expect(s.refundedOrders).toBe(1);
    expect(s.refundedCents).toBe(1500);
    expect(s.checkInRate).toBeCloseTo(0.4);
    expect(s.capacity).toBe(100);
  });

  it('sin límite en algún tipo, el aforo es null', () => {
    expect(ticketStats([venta(), venta({ id: 't2', capacity: null })], []).capacity).toBeNull();
  });
});

describe('dailySales', () => {
  it('rellena con ceros los días sin ventas y agrupa en hora de Madrid', () => {
    const dias = dailySales(
      [
        pedido({ paidAt: '2026-09-28T22:30:00Z' }), // 29 en Madrid
        pedido({ id: 'o2', paidAt: '2026-10-01T09:00:00Z', quantity: 1, amountCents: 1500 }),
        pedido({ id: 'o3', source: 'comp', paidAt: '2026-09-30T09:00:00Z' }),
      ],
      new Date('2026-10-01T12:00:00Z'),
    );
    expect(dias.map((d) => d.day)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(dias.map((d) => d.tickets)).toEqual([2, 0, 1]);
  });

  it('sin ventas no hay serie', () => {
    expect(dailySales([])).toEqual([]);
  });
});

describe('saleState', () => {
  const ahora = new Date('2026-10-01T12:00:00Z');
  it('distingue cada estado', () => {
    expect(saleState(venta(), false, ahora)).toBe('onSale');
    expect(saleState(venta({ active: false }), false, ahora)).toBe('paused');
    expect(saleState(venta({ sold: 100 }), false, ahora)).toBe('soldOut');
    expect(saleState(venta({ salesStartAt: '2026-10-02T00:00:00Z' }), false, ahora)).toBe('scheduled');
    expect(saleState(venta({ salesEndAt: '2026-09-30T00:00:00Z' }), false, ahora)).toBe('closed');
    expect(saleState(venta(), true, ahora)).toBe('closed');
  });
});
