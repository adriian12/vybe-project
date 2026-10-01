import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TicketAttendee, TicketOrder, TicketSale } from '@/services/tickets';

/**
 * «Gestión de entradas» (Ventas, migración 096), por dentro:
 *
 *   · el resumen separa lo cobrado de las invitaciones;
 *   · los pedidos se buscan y se filtran por origen;
 *   · la lista de asistentes marca la entrada a mano;
 *   · las invitaciones no se emiten sin nombre y mandan lo escrito.
 */

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => (opts && 'count' in opts ? `${key}:${opts.count}` : key),
      i18n: { resolvedLanguage: 'es', changeLanguage: vi.fn() },
    }),
  };
});
const toast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));

const datos = vi.hoisted(() => ({ asistentes: [] as TicketAttendee[] }));
const { setCheckedIn, issueComps } = vi.hoisted(() => ({
  setCheckedIn: vi.fn(async () => ({ status: 'used' as const, usedAt: '2026-10-03T23:10:00Z' })),
  issueComps: vi.fn(async () => ({ orderId: 'o9', emailed: true })),
}));
vi.mock('@/services/tickets', async () => {
  const actual = await vi.importActual<typeof import('@/services/tickets')>('@/services/tickets');
  return {
    ...actual,
    ticketsService: {
      getAttendees: vi.fn(async () => datos.asistentes),
      setCheckedIn,
      issueComps,
    },
  };
});

import TicketOverview from './ticket-overview';
import TicketOrders from './ticket-orders';
import TicketAttendees from './ticket-attendees';
import TicketComps from './ticket-comps';

const venta: TicketSale = {
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
  sold: 5,
  used: 2,
  revenueCents: 4500,
  minAge: null,
  dressCode: null,
  salesStartAt: null,
  salesEndAt: null,
  comps: 2,
};

const pedido = (over: Partial<TicketOrder>): TicketOrder => ({
  id: 'o1',
  buyer: 'Ana Pérez',
  typeName: 'General',
  kind: 'entry',
  quantity: 3,
  amountCents: 4500,
  netCents: 4100,
  status: 'paid',
  paidAt: new Date().toISOString(),
  refundedAt: null,
  used: 1,
  refundable: true,
  buyerEmail: 'ana@correo.es',
  source: 'online',
  note: null,
  typeId: 't1',
  ...over,
});

const pedidos = [
  pedido({}),
  pedido({ id: 'o2', buyer: 'DJ Invitado', buyerEmail: 'dj@sello.es', quantity: 2, amountCents: 0, netCents: 0, source: 'comp', refundable: false, note: 'DJ' }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Resumen', () => {
  it('enseña lo cobrado, lo que queda para el negocio y las invitaciones', () => {
    render(<TicketOverview ventas={[venta]} pedidos={pedidos} eventEnded={false} onOpenOrders={vi.fn()} />);
    expect(screen.getAllByText('45 €').length).toBeGreaterThan(0);
    expect(screen.getByText('41 €')).toBeTruthy();
    expect(screen.getByText('5 / 100')).toBeTruthy();
    expect(screen.getByText('sales.manage.kpi.withComps:2')).toBeTruthy();
    expect(screen.getByText('sales.manage.state.onSale')).toBeTruthy();
  });
});

describe('Pedidos', () => {
  it('busca y filtra por invitaciones', () => {
    render(<TicketOrders pedidos={pedidos} eventName="Aurora" busy={null} onRefund={vi.fn()} onResend={vi.fn()} />);
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /sales.manage.filters.comp/ }));
    expect(screen.queryByText('Ana Pérez')).toBeNull();
    expect(screen.getByText('DJ Invitado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /sales.manage.filters.all/ }));
    fireEvent.change(screen.getByLabelText('sales.manage.searchOrders'), { target: { value: 'ana@' } });
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.queryByText('DJ Invitado')).toBeNull();
  });

  it('el detalle deja reenviar y devolver', () => {
    const onResend = vi.fn();
    const onRefund = vi.fn();
    render(<TicketOrders pedidos={pedidos} eventName="Aurora" busy={null} onRefund={onRefund} onResend={onResend} />);
    fireEvent.click(screen.getByText('Ana Pérez'));
    fireEvent.click(screen.getByRole('button', { name: 'sales.manage.resend' }));
    fireEvent.click(screen.getByRole('button', { name: 'sales.payments.refund' }));
    expect(onResend).toHaveBeenCalledWith(pedidos[0]);
    expect(onRefund).toHaveBeenCalledWith(pedidos[0]);
  });
});

describe('Asistentes', () => {
  it('marca la entrada a mano', async () => {
    datos.asistentes = [
      {
        id: 'k1',
        code: 'E-1234ABCD',
        holderName: 'Luis Gómez',
        holderEmail: 'luis@correo.es',
        holderPhone: null,
        typeName: 'General',
        kind: 'entry',
        status: 'valid',
        usedAt: null,
        orderId: 'o1',
        source: 'online',
        buyer: 'Ana Pérez',
        paidAt: null,
      },
    ];
    const onChanged = vi.fn();
    render(<TicketAttendees eventId="e1" eventName="Aurora" version={0} onChanged={onChanged} />);
    expect(await screen.findByText('Luis Gómez')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /sales.manage.attendees.checkIn/ }));
    await waitFor(() => expect(setCheckedIn).toHaveBeenCalledWith('k1', true));
    expect(await screen.findByRole('button', { name: /sales.manage.attendees.undo/ })).toBeTruthy();
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('Invitaciones', () => {
  it('no emite sin nombre y manda lo escrito', async () => {
    const onIssued = vi.fn();
    render(<TicketComps ventas={[venta]} pedidos={pedidos} eventEnded={false} busy={null} onIssued={onIssued} onResend={vi.fn()} />);
    const boton = screen.getByRole('button', { name: /sales.manage.comps.submit/ });
    expect((boton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('sales.manage.comps.name'), { target: { value: 'Marta Ruiz' } });
    fireEvent.change(screen.getByLabelText('sales.manage.comps.email'), { target: { value: 'marta@prensa.es' } });
    fireEvent.click(screen.getByRole('button', { name: 'sales.manage.comps.more' }));
    fireEvent.click(boton);

    await waitFor(() =>
      expect(issueComps).toHaveBeenCalledWith({ typeId: 't1', quantity: 2, name: 'Marta Ruiz', email: 'marta@prensa.es', note: null }),
    );
    expect(onIssued).toHaveBeenCalled();
  });
});
