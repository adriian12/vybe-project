import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, RGB, StandardFonts } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

/**
 * La entrada en PDF (migraciones 077 y 086), una página por entrada, con el
 * diseño de la pantalla de Stitch «Entrada»:
 *
 *   · cabecera con el negocio (logo y nombre) y «powered by Fiestea»;
 *   · franja amarilla con el tipo de entrada y la fecha;
 *   · el estilo, el nombre de la fiesta y el sitio;
 *   · el QR grande con su código;
 *   · el recorte de ticket;
 *   · dos bloques: la entrada (tipo, precio, qué incluye, localizador) y quien
 *     la lleva (nombre, teléfono, correo, fecha de nacimiento);
 *   · edad mínima, dress code y las condiciones del negocio.
 *
 * Sólo datos reales: nada de verificaciones, códigos de barras ni sellos que
 * Fiestea no hace.
 */

export interface TicketPdfData {
  orderId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  venueName: string;
  venueLogo: string | null;
  /** «Palma» o la ciudad del negocio, bajo su nombre. */
  venueCity: string | null;
  /** Sala donde se celebra y su dirección («Amok Mallorca · Camí Can Capó, 4»). */
  placeLine: string | null;
  address: string | null;
  theme: string | null;
  typeName: string;
  kind: 'entry' | 'vip' | 'table';
  description: string | null;
  unitCents: number;
  guests: number | null;
  minAge: number | null;
  dressCode: string | null;
  terms: string | null;
  contactEmail: string | null;
  tickets: {
    code: string;
    holderName: string | null;
    holderEmail: string | null;
    holderPhone: string | null;
    holderBirthdate: string | null;
  }[];
}

const TINTA = rgb(0.059, 0.09, 0.165); // slate-900
const GRIS = rgb(0.392, 0.455, 0.545); // slate-500
const GRIS_OSCURO = rgb(0.2, 0.255, 0.333); // slate-700
const FONDO = rgb(0.945, 0.961, 0.976); // slate-100
const CAJA = rgb(0.973, 0.98, 0.988); // slate-50
const LINEA = rgb(0.886, 0.91, 0.941); // slate-200
const LINEA_FUERTE = rgb(0.796, 0.835, 0.882); // slate-300
const AMARILLO = rgb(0.973, 0.816, 0); // #F8D000
const AMARILLO_SUAVE = rgb(1, 0.984, 0.922); // amber-50
const AMBAR = rgb(0.992, 0.902, 0.541); // amber-200
const BLANCO = rgb(1, 1, 1);

const FIESTEA_LOGO = 'https://fiestea.es/icons/icon-192.png';
const TZ = 'Europe/Madrid';

const euros = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/** «JUE, 10 SEPT 2026». */
const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })
    .format(new Date(iso))
    .replace(/\./g, '')
    .toUpperCase();

const hora = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));

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
    if (linea) lineas.push(linea);
  }
  return lineas;
};

/** Recorta el texto con «…» hasta que quepa. */
const cabe = (text: string, font: PDFFont, size: number, ancho: number) => {
  let t = seguro(text);
  if (font.widthOfTextAtSize(t, size) <= ancho) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > ancho) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
};

const imagen = async (pdf: PDFDocument, url: string | null): Promise<PDFImage | null> => {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    const tipo = r.headers.get('content-type') ?? '';
    if (tipo.includes('png') || url.toLowerCase().endsWith('.png')) return await pdf.embedPng(bytes);
    if (tipo.includes('jpeg') || tipo.includes('jpg') || /\.jpe?g$/i.test(url)) return await pdf.embedJpg(bytes);
    return null;
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
        page.drawRectangle({ x: x + c * celda, y: y + size - (r + 1) * celda, width: celda + 0.2, height: celda + 0.2, color: TINTA });
      }
    }
  }
};

/** Rectángulo con esquinas redondeadas (pdf-lib no lo trae). */
const caja = (
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  estilo: { color?: RGB; borde?: RGB; grosor?: number },
) => {
  const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(p, {
    x,
    y: y + h,
    color: estilo.color,
    borderColor: estilo.borde,
    borderWidth: estilo.borde ? (estilo.grosor ?? 1) : 0,
  });
};

const centrado = (page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, W: number) =>
  page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });

/** Texto centrado con espacio entre letras (el código de la entrada). */
const espaciado = (page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB, W: number, aire: number) => {
  const ancho = text.split('').reduce((a, c) => a + font.widthOfTextAtSize(c, size), 0) + aire * (text.length - 1);
  let x = (W - ancho) / 2;
  for (const c of text) {
    page.drawText(c, { x, y, size, font, color });
    x += font.widthOfTextAtSize(c, size) + aire;
  }
};

export const renderTicketsPdf = async (data: TicketPdfData, soloCodigo?: string): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${data.eventName} · Entrada`);
  pdf.setAuthor('Fiestea');
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);
  const logoNegocio = await imagen(pdf, data.venueLogo);
  const logoFiestea = await imagen(pdf, FIESTEA_LOGO);

  const tipo = data.kind === 'table' ? 'MESA VIP' : data.kind === 'vip' ? 'ENTRADA VIP' : 'ENTRADA GENERAL';
  const personas = data.kind === 'table' ? (data.guests ?? 1) : 1;
  const localizador = `#${data.orderId.slice(0, 8).toUpperCase()}`;

  const W = 595;
  const H = 842;
  const X = 40; // borde de la tarjeta
  const TW = W - 2 * X;
  const PAD = 24;

  for (const ticket of data.tickets.filter((tk) => !soloCodigo || tk.code === soloCodigo)) {
    const page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: FONDO });
    caja(page, X, 30, TW, 782, 16, { color: BLANCO, borde: LINEA });

    // ------------------------------------------------------------ cabecera
    let xNombre = X + PAD;
    if (logoNegocio) {
      const d = logoNegocio.scaleToFit(40, 40);
      page.drawImage(logoNegocio, { x: X + PAD, y: 748, width: d.width, height: d.height });
      xNombre += d.width + 12;
    }
    const nombre = cabe(data.venueName.toUpperCase(), negrita, 20, 250);
    page.drawText(nombre, { x: xNombre, y: 768, size: 20, font: negrita, color: TINTA });
    if (data.venueCity) {
      page.drawText(cabe(data.venueCity, normal, 9, 250), { x: xNombre, y: 753, size: 9, font: normal, color: GRIS });
    }
    // «powered by [F] FIESTEA»
    const marca = 'FIESTEA';
    const anchoMarca = negrita.widthOfTextAtSize(marca, 12);
    const anchoPowered = normal.widthOfTextAtSize('powered by', 8.5);
    const pillW = 14 + anchoPowered + 8 + 18 + 6 + anchoMarca + 14;
    const pillX = X + TW - PAD - pillW;
    caja(page, pillX, 748, pillW, 30, 10, { color: CAJA, borde: LINEA });
    page.drawText('powered by', { x: pillX + 14, y: 759, size: 8.5, font: normal, color: GRIS });
    const fx = pillX + 14 + anchoPowered + 8;
    if (logoFiestea) page.drawImage(logoFiestea, { x: fx, y: 754, width: 18, height: 18 });
    else caja(page, fx, 754, 18, 18, 4, { color: AMARILLO });
    page.drawText(marca, { x: fx + 24, y: 758, size: 12, font: negrita, color: TINTA });

    page.drawLine({ start: { x: X, y: 732 }, end: { x: X + TW, y: 732 }, thickness: 1, color: LINEA });

    // --------------------------------------------------- franja amarilla
    page.drawRectangle({ x: X + 0.5, y: 702, width: TW - 1, height: 30, color: AMARILLO_SUAVE });
    page.drawLine({ start: { x: X, y: 702 }, end: { x: X + TW, y: 702 }, thickness: 1, color: AMBAR });
    page.drawCircle({ x: X + PAD + 4, y: 717, size: 4, color: AMARILLO });
    page.drawText(tipo, { x: X + PAD + 14, y: 713.5, size: 9.5, font: negrita, color: TINTA });
    const cuando = `${fechaCorta(data.startDate)} | ${hora(data.startDate)} - ${hora(data.endDate)}`;
    page.drawText(cuando, { x: X + TW - PAD - mono.widthOfTextAtSize(cuando, 9.5), y: 713.5, size: 9.5, font: mono, color: TINTA });

    // ---------------------------------------------------------- la fiesta
    let y = 676;
    if (data.theme) {
      centrado(page, cabe(data.theme.toUpperCase(), negrita, 8.5, TW - 80), y, negrita, 8.5, GRIS, W);
      y -= 30;
    } else y -= 22;
    let size = 26;
    const titulo = seguro(data.eventName);
    while (negrita.widthOfTextAtSize(titulo, size) > TW - 60 && size > 14) size -= 1;
    centrado(page, cabe(titulo, negrita, size, TW - 60), y, negrita, size, TINTA, W);
    y -= 20;
    if (data.placeLine) centrado(page, cabe(data.placeLine, normal, 9.5, TW - 60), y, normal, 9.5, GRIS_OSCURO, W);

    // ----------------------------------------------------------------- QR
    const qW = 210;
    const qX = (W - qW) / 2;
    const qY = 368;
    caja(page, qX, qY, qW, 232, 16, { color: BLANCO, borde: LINEA_FUERTE, grosor: 2 });
    qr(page, ticket.code, qX + 20, qY + 52, qW - 40);
    page.drawLine({ start: { x: qX + 16, y: qY + 42 }, end: { x: qX + qW - 16, y: qY + 42 }, thickness: 1, color: LINEA });
    espaciado(page, ticket.code, qY + 16, mono, 15, TINTA, W, 3);

    const valido = `Válido para ${personas} ${personas === 1 ? 'persona' : 'personas'} • Un solo uso en la puerta`;
    centrado(page, valido, 348, negrita, 10, TINTA, W);
    centrado(page, 'Enseña este QR en la puerta: deja de valer al escanearlo.', 334, normal, 8.5, GRIS, W);

    // ------------------------------------------------------ recorte ticket
    const corteY = 314;
    page.drawLine({
      start: { x: X + 22, y: corteY },
      end: { x: X + TW - 22, y: corteY },
      thickness: 1.5,
      color: LINEA_FUERTE,
      dashArray: [5, 4],
    });
    page.drawCircle({ x: X, y: corteY, size: 14, color: FONDO, borderColor: LINEA_FUERTE, borderWidth: 1 });
    page.drawCircle({ x: X + TW, y: corteY, size: 14, color: FONDO, borderColor: LINEA_FUERTE, borderWidth: 1 });
    // Tapa la mitad de fuera de los círculos para que parezcan mordiscos.
    page.drawRectangle({ x: X - 15, y: corteY - 15, width: 15, height: 30, color: FONDO });
    page.drawRectangle({ x: X + TW, y: corteY - 15, width: 15, height: 30, color: FONDO });

    // ------------------------------------------------------- dos bloques
    const bY = 132;
    const bH = 160;
    const bW = (TW - 2 * PAD - 16) / 2;
    const b1 = X + PAD;
    const b2 = b1 + bW + 16;
    caja(page, b1, bY, bW, bH, 12, { color: CAJA, borde: LINEA });
    caja(page, b2, bY, bW, bH, 12, { color: CAJA, borde: LINEA });

    const titular = (bx: number, texto: string, extra?: string) => {
      page.drawCircle({ x: bx + 16, y: bY + bH - 20, size: 3.5, color: AMARILLO });
      page.drawText(texto, { x: bx + 26, y: bY + bH - 23, size: 8.5, font: negrita, color: TINTA });
      if (extra) page.drawText(extra, { x: bx + bW - 14 - mono.widthOfTextAtSize(extra, 8), y: bY + bH - 23, size: 8, font: mono, color: GRIS });
      page.drawLine({ start: { x: bx + 14, y: bY + bH - 32 }, end: { x: bx + bW - 14, y: bY + bH - 32 }, thickness: 1, color: LINEA });
    };

    // Detalles de la entrada
    titular(b1, 'DETALLES DE LA ENTRADA', localizador);
    let ly = bY + bH - 48;
    page.drawText('Tipo de entrada', { x: b1 + 14, y: ly, size: 7.5, font: normal, color: GRIS });
    ly -= 12;
    page.drawText(cabe(data.typeName, negrita, 10.5, bW - 28), { x: b1 + 14, y: ly, size: 10.5, font: negrita, color: TINTA });
    ly -= 17;
    page.drawText('Precio', { x: b1 + 14, y: ly, size: 7.5, font: normal, color: GRIS });
    ly -= 13;
    const precio = data.unitCents === 0 ? 'Gratis' : euros(data.unitCents);
    page.drawText(precio, { x: b1 + 14, y: ly, size: 12, font: mono, color: TINTA });
    if (data.unitCents > 0) {
      page.drawText('Impuestos incluidos', {
        x: b1 + 20 + mono.widthOfTextAtSize(precio, 12),
        y: ly + 1,
        size: 7,
        font: normal,
        color: GRIS,
      });
    }
    if (data.description) {
      ly -= 16;
      page.drawText('Incluye', { x: b1 + 14, y: ly, size: 7.5, font: normal, color: GRIS });
      for (const linea of partir(data.description, normal, 8.5, bW - 28).slice(0, 3)) {
        ly -= 11;
        page.drawText(linea, { x: b1 + 14, y: ly, size: 8.5, font: normal, color: TINTA });
      }
    }

    // Quien la lleva
    titular(b2, 'DATOS DEL TITULAR');
    const filas: [string, string | null][] = [
      ['Nombre completo', ticket.holderName],
      ['Teléfono', ticket.holderPhone],
      ['Email', ticket.holderEmail],
      [
        'Fecha de nacimiento',
        ticket.holderBirthdate
          ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
              new Date(`${ticket.holderBirthdate}T12:00:00`),
            )
          : null,
      ],
    ];
    let ry = bY + bH - 52;
    for (const [etiqueta, valor] of filas) {
      page.drawText(etiqueta, { x: b2 + 14, y: ry, size: 7.5, font: normal, color: GRIS });
      const v = cabe(valor ?? '—', etiqueta === 'Nombre completo' ? negrita : normal, etiqueta === 'Nombre completo' ? 10 : 8.5, bW - 28 - 80);
      const f = etiqueta === 'Nombre completo' ? negrita : normal;
      const s = etiqueta === 'Nombre completo' ? 10 : 8.5;
      page.drawText(v, { x: b2 + bW - 14 - f.widthOfTextAtSize(v, s), y: ry, size: s, font: f, color: TINTA });
      ry -= 8;
      page.drawLine({ start: { x: b2 + 14, y: ry }, end: { x: b2 + bW - 14, y: ry }, thickness: 0.8, color: LINEA });
      ry -= 18;
    }

    // ------------------------------------------------------------- pie
    let py = 112;
    const chips = [
      data.minAge ? `Sólo mayores de ${data.minAge} años (+${data.minAge})` : null,
      data.dressCode ? `Dress code: ${data.dressCode}` : null,
      data.kind === 'table' && data.guests ? `Mesa para ${data.guests} personas` : null,
    ].filter((c): c is string => Boolean(c));
    if (chips.length > 0) {
      page.drawText(cabe(chips.join('  •  '), negrita, 8.5, TW - 2 * PAD), { x: X + PAD, y: py, size: 8.5, font: negrita, color: TINTA });
      py -= 16;
    }
    page.drawLine({ start: { x: X + PAD, y: py + 6 }, end: { x: X + TW - PAD, y: py + 6 }, thickness: 0.8, color: LINEA });
    const condiciones =
      data.terms?.trim() ||
      `Entrada nominal. El código QR vale para una sola entrada y deja de valer al escanearlo en la puerta. ${data.venueName} se reserva el derecho de admisión.`;
    const lineas = partir(`Condiciones de acceso: ${condiciones}`, normal, 7.5, TW - 2 * PAD).slice(0, 4);
    for (const linea of lineas) {
      py -= 10;
      page.drawText(linea, { x: X + PAD, y: py, size: 7.5, font: normal, color: GRIS_OSCURO });
    }
    // Pie: primero se mide lo de la derecha y lo de la izquierda ocupa el resto.
    const soporte = `${data.contactEmail ? `Soporte: ${data.contactEmail} · ` : ''}fiestea.es`;
    const anchoSoporte = Math.min(mono.widthOfTextAtSize(soporte, 7), TW / 2);
    const emision = cabe(
      `Pedido ${localizador} · Vendida por ${seguro(data.venueName)} a través de Fiestea`,
      mono,
      7,
      TW - 2 * PAD - anchoSoporte - 16,
    );
    const soporteCorto = cabe(soporte, mono, 7, anchoSoporte);
    page.drawLine({ start: { x: X + PAD, y: 54 }, end: { x: X + TW - PAD, y: 54 }, thickness: 0.8, color: LINEA });
    page.drawText(emision, { x: X + PAD, y: 42, size: 7, font: mono, color: GRIS });
    page.drawText(soporteCorto, {
      x: X + TW - PAD - mono.widthOfTextAtSize(soporteCorto, 7),
      y: 42,
      size: 7,
      font: mono,
      color: GRIS,
    });
  }

  return await pdf.save();
};

/** Los datos de un pedido pagado para su PDF, su correo y su pase del Wallet. */
export const loadTicketOrder = async (supabase: SupabaseClient, filtro: { orderId?: string; token?: string }) => {
  let q = supabase
    .from('ticket_orders')
    .select(
      'id, status, quantity, unit_cents, buyer_email, download_token, email_sent_at, profile_id, event_id, venue_id, ' +
        'ticket_types(name, kind, description, guests, min_age, dress_code), ' +
        'events(name, start_date, end_date, city, latitude, longitude, theme, place_name, address, min_age, dress_code), ' +
        'venues(name, logo_url, address, city, contact_email, business_terms, is_platform), profiles(name, email)',
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

  const tt = order.ticket_types as unknown as {
    name: string;
    kind: 'entry' | 'vip' | 'table';
    description: string | null;
    guests: number | null;
    min_age: number | null;
    dress_code: string | null;
  };
  const ev = order.events as unknown as {
    name: string;
    start_date: string;
    end_date: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    theme: string | null;
    place_name: string | null;
    address: string | null;
    min_age: number | null;
    dress_code: string | null;
  };
  const ve = order.venues as unknown as {
    name: string;
    logo_url: string | null;
    address: string | null;
    city: string | null;
    contact_email: string | null;
    business_terms: string | null;
    is_platform: boolean | null;
  };
  const pr = order.profiles as unknown as { name: string | null; email: string | null } | null;

  // El sitio: la sala de la fiesta si la tiene; si no, el propio negocio.
  const sala = ev.place_name ?? (ve.is_platform ? null : ve.name);
  const direccion = ev.address ?? ve.address;
  const ciudad = ev.city ?? ve.city;
  const lugar = [sala, direccion ?? ciudad].filter(Boolean).join(' · ') || null;

  const data: TicketPdfData = {
    orderId: order.id,
    eventName: ev.name,
    startDate: ev.start_date,
    endDate: ev.end_date,
    venueName: ve.is_platform && ev.place_name ? ev.place_name : ve.name,
    venueLogo: ve.logo_url,
    venueCity: ciudad ? `${ciudad}${ciudad.toLowerCase().includes('mallorca') ? '' : ' · Illes Balears'}` : null,
    placeLine: lugar,
    address: direccion ? `${direccion}${ciudad && !direccion.includes(ciudad) ? `, ${ciudad}` : ''}` : ciudad,
    theme: ev.theme,
    typeName: tt.name,
    kind: tt.kind,
    description: tt.description,
    unitCents: order.unit_cents,
    guests: tt.guests,
    minAge: tt.min_age ?? ev.min_age,
    dressCode: tt.dress_code ?? ev.dress_code,
    terms: ve.business_terms,
    contactEmail: ve.contact_email,
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
