import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

/**
 * La entrada en PDF (migración 077), con el diseño de las entradas nominales:
 * logo y nombre del negocio arriba a la izquierda, «powered by Fiestea» a la
 * derecha, la franja con el tipo y la fecha, el nombre de la fiesta, el QR con
 * su código, lo que incluye, los datos del asistente y la ubicación abajo.
 * Una página por entrada, en los colores de Fiestea.
 */

export interface TicketPdfData {
  orderId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  venueName: string;
  venueLogo: string | null;
  address: string | null;
  typeName: string;
  kind: 'entry' | 'vip' | 'table';
  description: string | null;
  unitCents: number;
  guests: number | null;
  tickets: {
    code: string;
    holderName: string | null;
    holderEmail: string | null;
    holderPhone: string | null;
    holderBirthdate: string | null;
  }[];
}

const NEGRO = rgb(0.067, 0.067, 0.078);
const GRIS = rgb(0.42, 0.42, 0.45);
const GRIS_CLARO = rgb(0.95, 0.95, 0.96);
const AMARILLO = rgb(0.973, 0.816, 0);
const AMARILLO_SUAVE = rgb(1, 0.965, 0.8);
const BLANCO = rgb(1, 1, 1);

const FIESTEA_LOGO = 'https://fiestea.es/icons/icon-192.png';

const euros = (cents: number) =>
  cents === 0 ? '0,00 €' : `${(cents / 100).toFixed(2).replace('.', ',')} €`;

const fechaLarga = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  })
    .format(new Date(iso))
    .toUpperCase();

const hora = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date(iso));

/** Quita lo que la fuente estándar (WinAnsi) no sabe pintar, como los emojis. */
const seguro = (text: string) =>
  text.replace(/[^\x20-\x7E\u00A0-\u00FF\u20AC\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '');

const partir = (text: string, font: PDFFont, size: number, ancho: number): string[] => {
  const lineas: string[] = [];
  for (const parrafo of seguro(text).split('\n')) {
    let linea = '';
    for (const palabra of parrafo.split(/\s+/)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(prueba, size) > ancho && linea) {
        lineas.push(linea);
        linea = palabra;
      } else linea = prueba;
    }
    lineas.push(linea);
  }
  return lineas;
};

const imagen = async (pdf: PDFDocument, url: string | null): Promise<PDFImage | null> => {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const tipo = r.headers.get('content-type') ?? '';
    if (tipo.includes('png') || url.toLowerCase().endsWith('.png')) return await pdf.embedPng(bytes);
    return await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
};

const qr = (page: PDFPage, text: string, x: number, y: number, size: number) => {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const celda = size / n;
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (modules.get(r, c)) {
        page.drawRectangle({ x: x + c * celda, y: y + size - (r + 1) * celda, width: celda + 0.2, height: celda + 0.2, color: NEGRO });
      }
    }
  }
};

export const renderTicketsPdf = async (data: TicketPdfData, soloCodigo?: string): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${data.eventName} · Entrada`);
  pdf.setAuthor('Fiestea');
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoNegocio = await imagen(pdf, data.venueLogo);
  const logoFiestea = await imagen(pdf, FIESTEA_LOGO);

  const tipo = data.kind === 'table' ? 'MESA VIP' : data.kind === 'vip' ? 'ENTRADA VIP' : 'ENTRADA';
  const personas = data.kind === 'table' ? (data.guests ?? 1) : 1;

  for (const ticket of data.tickets.filter((tk) => !soloCodigo || tk.code === soloCodigo)) {
    const page = pdf.addPage([612, 792]);
    const W = 612;
    const M = 40;

    // Cabecera: negocio a la izquierda, «powered by Fiestea» a la derecha.
    let xNombre = M;
    if (logoNegocio) {
      const d = logoNegocio.scaleToFit(34, 34);
      page.drawImage(logoNegocio, { x: M, y: 735, width: d.width, height: d.height });
      xNombre = M + d.width + 10;
    }
    page.drawText(seguro(data.venueName).toUpperCase().slice(0, 34), { x: xNombre, y: 745, size: 16, font: negrita, color: NEGRO });
    const marca = 'Fiestea';
    const anchoMarca = negrita.widthOfTextAtSize(marca, 14);
    page.drawText(marca, { x: W - M - anchoMarca, y: 745, size: 14, font: negrita, color: NEGRO });
    if (logoFiestea) page.drawImage(logoFiestea, { x: W - M - anchoMarca - 24, y: 741, width: 20, height: 20 });
    const powered = 'powered by';
    page.drawText(powered, { x: W - M - anchoMarca - 30 - normal.widthOfTextAtSize(powered, 9), y: 747, size: 9, font: normal, color: GRIS });

    // Franja: tipo y fecha.
    page.drawRectangle({ x: M, y: 690, width: W - 2 * M, height: 30, color: NEGRO });
    page.drawText(tipo, { x: M + 14, y: 700, size: 11, font: negrita, color: AMARILLO });
    const cuando = `${fechaLarga(data.startDate)}  |  ${hora(data.startDate)} - ${hora(data.endDate)}`;
    page.drawText(cuando, { x: W - M - 14 - negrita.widthOfTextAtSize(cuando, 10), y: 701, size: 10, font: negrita, color: BLANCO });

    // Bloque amarillo con el nombre de la fiesta y el QR encima.
    page.drawRectangle({ x: M, y: 450, width: W - 2 * M, height: 240, color: AMARILLO_SUAVE });
    const titulo = seguro(data.eventName).slice(0, 60);
    let size = 22;
    while (negrita.widthOfTextAtSize(titulo, size) > W - 2 * M - 30 && size > 12) size -= 1;
    page.drawText(titulo, { x: (W - negrita.widthOfTextAtSize(titulo, size)) / 2, y: 655, size, font: negrita, color: NEGRO });

    const tarjeta = 210;
    const tx = (W - tarjeta) / 2;
    page.drawRectangle({ x: tx, y: 395, width: tarjeta, height: 245, color: BLANCO, borderColor: rgb(0.88, 0.88, 0.9), borderWidth: 1 });
    qr(page, ticket.code, tx + 20, 450, tarjeta - 40);
    page.drawText(ticket.code, { x: (W - negrita.widthOfTextAtSize(ticket.code, 16)) / 2, y: 415, size: 16, font: negrita, color: NEGRO });

    const valido = `Válido para ${personas} ${personas === 1 ? 'persona' : 'personas'}`;
    page.drawText(valido, { x: (W - normal.widthOfTextAtSize(valido, 11)) / 2, y: 370, size: 11, font: normal, color: GRIS });

    // Izquierda: el tipo, el precio y lo que incluye.
    const cajaY = 150;
    const cajaH = 190;
    const cajaW = (W - 2 * M - 16) / 2;
    page.drawRectangle({ x: M, y: cajaY, width: cajaW, height: cajaH, borderColor: rgb(0.85, 0.85, 0.87), borderWidth: 1, borderDashArray: [2, 3] });
    let y = cajaY + cajaH - 28;
    page.drawText(seguro(data.typeName).slice(0, 38), { x: M + 16, y, size: 14, font: negrita, color: NEGRO });
    y -= 20;
    page.drawText(`Precio: ${euros(data.unitCents)}`, { x: M + 16, y, size: 11, font: negrita, color: NEGRO });
    y -= 13;
    page.drawText('Tasas e impuestos incluidos', { x: M + 16, y, size: 8, font: normal, color: GRIS });
    if (data.description) {
      y -= 18;
      for (const linea of partir(`Incluye: ${data.description}`, normal, 9.5, cajaW - 32).slice(0, 8)) {
        page.drawText(linea, { x: M + 16, y, size: 9.5, font: normal, color: NEGRO });
        y -= 12;
      }
    }

    // Derecha: el asistente.
    const dx = M + cajaW + 16;
    page.drawRectangle({ x: dx, y: cajaY, width: cajaW, height: cajaH, color: GRIS_CLARO });
    y = cajaY + cajaH - 30;
    page.drawText(seguro(ticket.holderName ?? 'Entrada nominal').slice(0, 30), { x: dx + 16, y, size: 15, font: negrita, color: NEGRO });
    for (const [etiqueta, valor] of [
      ['Teléfono', ticket.holderPhone],
      ['Email', ticket.holderEmail],
      [
        'Nacimiento',
        ticket.holderBirthdate ? new Date(`${ticket.holderBirthdate}T12:00:00`).toLocaleDateString('es-ES') : null,
      ],
    ] as const) {
      if (!valor) continue;
      y -= 20;
      page.drawText(`${etiqueta}: `, { x: dx + 16, y, size: 10, font: normal, color: GRIS });
      page.drawText(seguro(valor).slice(0, 34), { x: dx + 16 + normal.widthOfTextAtSize(`${etiqueta}: `, 10), y, size: 10, font: negrita, color: NEGRO });
    }

    // Abajo: la ubicación.
    page.drawRectangle({ x: M, y: 70, width: W - 2 * M, height: 60, color: NEGRO });
    page.drawText('UBICACIÓN', { x: (W - negrita.widthOfTextAtSize('UBICACIÓN', 10)) / 2, y: 108, size: 10, font: negrita, color: AMARILLO });
    const donde = seguro(data.address ?? data.venueName).slice(0, 90);
    page.drawText(donde, { x: (W - normal.widthOfTextAtSize(donde, 10)) / 2, y: 88, size: 10, font: normal, color: BLANCO });

    const pie = 'Entrada nominal. Enseña el QR en la puerta. Cada código vale una sola vez. · fiestea.es';
    page.drawText(pie, { x: (W - normal.widthOfTextAtSize(pie, 8)) / 2, y: 45, size: 8, font: normal, color: GRIS });
  }

  return await pdf.save();
};

/** Los datos de un pedido pagado para su PDF, su correo y su pase del Wallet. */
export const loadTicketOrder = async (supabase: SupabaseClient, filtro: { orderId?: string; token?: string }) => {
  let q = supabase
    .from('ticket_orders')
    .select(
      'id, status, quantity, unit_cents, buyer_email, download_token, email_sent_at, profile_id, event_id, venue_id, ' +
        'ticket_types(name, kind, description, guests), events(name, start_date, end_date, city, latitude, longitude), ' +
        'venues(name, logo_url, address, city), profiles(name, email)',
    )
    .limit(1);
  q = filtro.orderId ? q.eq('id', filtro.orderId) : q.eq('download_token', filtro.token ?? '-');
  const { data: order } = await q.maybeSingle();
  if (!order || order.status !== 'paid') return null;

  const { data: tickets } = await supabase
    .from('tickets')
    .select('code, holder_name, holder_email, holder_phone, holder_birthdate, created_at')
    .eq('order_id', order.id)
    .order('created_at');

  const tt = order.ticket_types as unknown as { name: string; kind: 'entry' | 'vip' | 'table'; description: string | null; guests: number | null };
  const ev = order.events as unknown as { name: string; start_date: string; end_date: string; city: string | null; latitude: number | null; longitude: number | null };
  const ve = order.venues as unknown as { name: string; logo_url: string | null; address: string | null; city: string | null };
  const pr = order.profiles as unknown as { name: string | null; email: string | null } | null;

  const data: TicketPdfData = {
    orderId: order.id,
    eventName: ev.name,
    startDate: ev.start_date,
    endDate: ev.end_date,
    venueName: ve.name,
    venueLogo: ve.logo_url,
    address: ve.address ? `${ve.address}${ve.city ? `, ${ve.city}` : ''}` : (ev.city ?? ve.city),
    typeName: tt.name,
    kind: tt.kind,
    description: tt.description,
    unitCents: order.unit_cents,
    guests: tt.guests,
    tickets: (tickets ?? []).map((t) => ({
      code: t.code,
      holderName: t.holder_name ?? pr?.name ?? null,
      holderEmail: t.holder_email,
      holderPhone: t.holder_phone,
      holderBirthdate: t.holder_birthdate,
    })),
  };

  return {
    data,
    token: order.download_token as string,
    emailSentAt: order.email_sent_at as string | null,
    buyerEmail: (order.buyer_email as string | null) ?? pr?.email ?? null,
    location: ev.latitude !== null && ev.longitude !== null ? { latitude: ev.latitude, longitude: ev.longitude } : null,
  };
};
