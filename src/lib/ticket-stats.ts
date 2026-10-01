import type { TicketOrder, TicketSale } from '@/services/tickets';

/**
 * Cifras de «Gestión de entradas» (Ventas → Resumen), calculadas con lo que
 * ya devuelven `get_ticket_sales` y `get_ticket_orders`.
 *
 * Las invitaciones (`source = 'comp'`) cuentan para el aforo y la puerta, pero
 * no como venta: no suman ingresos, ni pedidos, ni ticket medio.
 */

export interface TicketStats {
  /** Lo cobrado (pedidos pagados, sin devoluciones). */
  grossCents: number;
  /** Lo que le queda al negocio tras la comisión de la plataforma. */
  netCents: number;
  /** Entradas vendidas (sin invitaciones). */
  sold: number;
  comps: number;
  /** Plazas a la venta; null si algún tipo no tiene límite. */
  capacity: number | null;
  /** Entradas emitidas (vendidas + invitaciones) ya validadas en la puerta. */
  validated: number;
  /** De 0 a 1 sobre las emitidas. */
  checkInRate: number;
  paidOrders: number;
  avgOrderCents: number;
  refundedOrders: number;
  refundedCents: number;
}

export const ticketStats = (ventas: TicketSale[], pedidos: TicketOrder[]): TicketStats => {
  const pagados = pedidos.filter((p) => p.status === 'paid' && p.source !== 'comp');
  const devueltos = pedidos.filter((p) => p.status === 'refunded');
  const emitidas = ventas.reduce((n, v) => n + v.sold, 0);
  const comps = ventas.reduce((n, v) => n + v.comps, 0);
  const validadas = ventas.reduce((n, v) => n + v.used, 0);
  const activos = ventas.filter((v) => v.active || v.sold > 0);
  const capacidad =
    activos.length > 0 && activos.every((v) => v.capacity !== null)
      ? activos.reduce((n, v) => n + (v.capacity ?? 0), 0)
      : null;
  const bruto = pagados.reduce((n, p) => n + p.amountCents, 0);

  return {
    grossCents: bruto,
    netCents: pagados.reduce((n, p) => n + p.netCents, 0),
    sold: emitidas - comps,
    comps,
    capacity: capacidad,
    validated: validadas,
    checkInRate: emitidas > 0 ? validadas / emitidas : 0,
    paidOrders: pagados.length,
    avgOrderCents: pagados.length > 0 ? Math.round(bruto / pagados.length) : 0,
    refundedOrders: devueltos.length,
    refundedCents: devueltos.reduce((n, p) => n + p.amountCents, 0),
  };
};

export interface DailySales {
  /** `AAAA-MM-DD` en hora de Madrid. */
  day: string;
  tickets: number;
  cents: number;
}

const diaMadrid = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso),
  );

/**
 * Ventas por día, del primer pedido a hoy (o al final de la venta), con los
 * días sin ventas a cero para que la gráfica no salte. Como mucho `maxDays`.
 */
export const dailySales = (pedidos: TicketOrder[], hasta: Date = new Date(), maxDays = 30): DailySales[] => {
  const vendidos = pedidos.filter((p) => p.status === 'paid' && p.source !== 'comp' && p.paidAt);
  if (vendidos.length === 0) return [];

  const porDia = new Map<string, DailySales>();
  for (const p of vendidos) {
    const dia = diaMadrid(p.paidAt as string);
    const fila = porDia.get(dia) ?? { day: dia, tickets: 0, cents: 0 };
    fila.tickets += p.quantity;
    fila.cents += p.amountCents;
    porDia.set(dia, fila);
  }

  const primero = [...porDia.keys()].sort()[0];
  const ultimo = diaMadrid(hasta.toISOString());
  const dias: DailySales[] = [];
  // Mediodía UTC: sumar días nunca cruza un cambio de hora hacia el día de al lado.
  const cursor = new Date(`${primero}T12:00:00Z`);
  const fin = new Date(`${ultimo < primero ? primero : ultimo}T12:00:00Z`);
  while (cursor <= fin) {
    const dia = cursor.toISOString().slice(0, 10);
    dias.push(porDia.get(dia) ?? { day: dia, tickets: 0, cents: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias.slice(-maxDays);
};

export type SaleState = 'onSale' | 'scheduled' | 'closed' | 'soldOut' | 'paused';

/** En qué punto de la venta está un tipo de entrada ahora mismo. */
export const saleState = (venta: TicketSale, eventEnded: boolean, ahora: Date = new Date()): SaleState => {
  if (eventEnded) return 'closed';
  if (!venta.active) return 'paused';
  if (venta.salesEndAt && new Date(venta.salesEndAt) <= ahora) return 'closed';
  if (venta.capacity !== null && venta.sold >= venta.capacity) return 'soldOut';
  if (venta.salesStartAt && new Date(venta.salesStartAt) > ahora) return 'scheduled';
  return 'onSale';
};

/** Colores de la etiqueta de cada estado (panel, tarjetas blancas). */
export const SALE_STATE_CLASS: Record<SaleState, string> = {
  onSale: 'bg-emerald-100 text-emerald-800',
  scheduled: 'bg-sky-100 text-sky-800',
  soldOut: 'bg-rose-100 text-rose-800',
  paused: 'bg-black/[0.06] text-party-gray',
  closed: 'bg-black/[0.06] text-party-gray',
};
