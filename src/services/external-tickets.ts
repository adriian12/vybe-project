import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { supabase } from '@/integrations/supabase/client';
import { ImportedTicket, parseTicket, PdfTextItem } from '@/lib/ticket-import';
import type { Event } from '@/types/venue';

/**
 * Entradas de otras plataformas (Fourvenues…) en «Entradas» (migración 104).
 *
 * El PDF se lee en el propio dispositivo con pdf.js (texto y página
 * renderizada) y jsQR (el QR). No se sube a ningún sitio: sólo se guardan los
 * campos que se enseñan y el contenido exacto del QR, que es lo que escanea la
 * puerta. pdf.js y jsQR se cargan sólo al añadir una entrada.
 */

export interface ExternalTicket {
  id: string;
  source: 'fourvenues' | 'other';
  qrText: string;
  code: string | null;
  eventName: string | null;
  organizer: string | null;
  kind: string | null;
  ticketType: string | null;
  details: string | null;
  priceCents: number | null;
  people: number | null;
  holderName: string | null;
  address: string | null;
  startsAt: string | null;
  endsLabel: string | null;
  eventId: string | null;
  archived: boolean;
}

interface Row {
  id: string;
  source: 'fourvenues' | 'other';
  qr_text: string;
  code: string | null;
  event_name: string | null;
  organizer: string | null;
  kind: string | null;
  ticket_type: string | null;
  details: string | null;
  price_cents: number | null;
  people: number | null;
  holder_name: string | null;
  address: string | null;
  starts_at: string | null;
  ends_label: string | null;
  event_id: string | null;
  archived_at: string | null;
}

const fromRow = (r: Row): ExternalTicket => ({
  id: r.id,
  source: r.source,
  qrText: r.qr_text,
  code: r.code,
  eventName: r.event_name,
  organizer: r.organizer,
  kind: r.kind,
  ticketType: r.ticket_type,
  details: r.details,
  priceCents: r.price_cents,
  people: r.people,
  holderName: r.holder_name,
  address: r.address,
  startsAt: r.starts_at,
  endsLabel: r.ends_label,
  eventId: r.event_id,
  archived: Boolean(r.archived_at),
});

// ---------------------------------------------------------------------------
// Lectura del archivo
// ---------------------------------------------------------------------------

type JsQR = (typeof import('jsqr'))['default'];

const qrDeCanvas = (canvas: HTMLCanvasElement, jsQR: JsQR): string | null => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
};

export class TicketReadError extends Error {
  constructor(readonly code: 'UNSUPPORTED' | 'UNREADABLE') {
    super(code);
  }
}

/** Lee un PDF o una captura de una entrada. */
export const readTicketFile = async (file: File): Promise<ImportedTicket> => {
  const jsQR = (await import('jsqr')).default;
  const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  if (esPdf) {
    // La versión «legacy» funciona también en los WebView antiguos de Android.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;

    const tarea = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    let doc;
    try {
      doc = await tarea.promise;
    } catch {
      throw new TicketReadError('UNREADABLE');
    }
    const pagina = await doc.getPage(1);
    const vista = pagina.getViewport({ scale: 1 });
    const texto = await pagina.getTextContent();
    const items: PdfTextItem[] = (texto.items as TextItem[])
      .filter((i) => typeof i.str === 'string')
      .map((i) => ({
        str: i.str,
        x: i.transform[4],
        y: vista.height - i.transform[5],
        h: Math.abs(i.transform[3]),
        w: i.width,
      }));

    let completo = '';
    for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
      const c = await (await doc.getPage(n)).getTextContent();
      completo += (c.items as TextItem[]).map((i) => i.str ?? '').join(' ') + '\n';
    }

    // El QR, de la página renderizada (sirve tanto si va como imagen como en vectores).
    let qr: string | null = null;
    for (const escala of [3, 2, 4]) {
      const v = pagina.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(v.width);
      canvas.height = Math.ceil(v.height);
      // `print`: pinta sin requestAnimationFrame, que se para si la app pasa a
      // segundo plano mientras se lee el PDF.
      await pagina.render({ canvasContext: canvas.getContext('2d')!, viewport: v, canvas, intent: 'print' }).promise;
      qr = qrDeCanvas(canvas, jsQR);
      if (qr) break;
    }
    await tarea.destroy();
    return parseTicket(items, vista.width, qr ?? '', completo);
  }

  if (file.type.startsWith('image/')) {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) throw new TicketReadError('UNREADABLE');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const qr = qrDeCanvas(canvas, jsQR);
    return parseTicket([], bitmap.width, qr ?? '', '');
  }

  throw new TicketReadError('UNSUPPORTED');
};

// ---------------------------------------------------------------------------
// Fiesta de Fiestea que corresponde a la entrada
// ---------------------------------------------------------------------------

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'by', 'x', 'y', 'en', 'and', 'the', 'club', 'palma']);
const palabras = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !PALABRAS_VACIAS.has(w)),
  );

/**
 * La fiesta de Fiestea del mismo día que más se parece (nombre, sala y
 * dirección), si se parece lo bastante.
 */
export const matchEvent = (ticket: Pick<ImportedTicket, 'eventName' | 'organizer' | 'address' | 'startsLocal'>, events: Event[]): Event | null => {
  if (!ticket.startsLocal) return null;
  const dia = ticket.startsLocal.slice(0, 10);
  const propias = palabras([ticket.eventName, ticket.organizer, ticket.address].filter(Boolean).join(' '));
  if (propias.size === 0) return null;

  let mejor: { event: Event; score: number } | null = null;
  for (const event of events) {
    const inicio = new Date(event.startDate);
    const local = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`;
    if (local !== dia) continue;
    const suyas = palabras([event.name, event.venueName, event.placeName, event.location?.address].filter(Boolean).join(' '));
    const comunes = [...propias].filter((w) => suyas.has(w)).length;
    const score = comunes / Math.min(propias.size, suyas.size || 1);
    if (!mejor || score > mejor.score) mejor = { event, score };
  }
  return mejor && mejor.score >= 0.34 ? mejor.event : null;
};

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const COLUMNAS =
  'id, source, qr_text, code, event_name, organizer, kind, ticket_type, details, price_cents, people, holder_name, address, starts_at, ends_label, event_id, archived_at';

export const externalTicketsService = {
  getMine: async (): Promise<ExternalTicket[]> => {
    const { data, error } = await supabase
      .from('external_tickets')
      .select(COLUMNAS)
      .order('starts_at', { ascending: true, nullsFirst: false });
    if (error) {
      console.error('Error getting external tickets:', error);
      return [];
    }
    return (data as Row[]).map(fromRow);
  },

  /** Guarda la entrada. `DUPLICATE` si ya estaba. */
  add: async (t: ImportedTicket, eventId: string | null): Promise<ExternalTicket> => {
    const { data, error } = await supabase
      .from('external_tickets')
      .insert({
        source: t.source,
        qr_text: t.qrText,
        code: t.code,
        event_name: t.eventName,
        organizer: t.organizer,
        kind: t.kind,
        ticket_type: t.ticketType,
        details: t.details,
        price_cents: t.priceCents,
        people: t.people,
        holder_name: t.holderName,
        address: t.address,
        // La hora del PDF es la del lugar de la fiesta, que es la del móvil.
        starts_at: t.startsLocal ? new Date(t.startsLocal).toISOString() : null,
        ends_label: t.endsLabel,
        event_id: eventId,
      })
      .select(COLUMNAS)
      .single();
    if (error) throw new Error(error.code === '23505' ? 'DUPLICATE' : 'SAVE_FAILED');
    return fromRow(data as Row);
  },

  setArchived: async (id: string, archived: boolean): Promise<void> => {
    const { error } = await supabase
      .from('external_tickets')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) throw error;
  },

  remove: async (id: string): Promise<void> => {
    const { error } = await supabase.from('external_tickets').delete().eq('id', id);
    if (error) throw error;
  },
};
