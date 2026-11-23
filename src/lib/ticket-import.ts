/**
 * Lectura de entradas de otras plataformas (migración 104).
 *
 * Recibe el texto de la primera página del PDF tal como lo da pdf.js (cada
 * trozo con su posición y su tamaño) y saca los campos. Está afinado para
 * Fourvenues, que maqueta siempre igual:
 *
 *   arriba         el organizador («Zar Society»)
 *   franja         TIPO · SÁB. 17 DE OCT. DE 2026 | 6:00 PM - CIERRE
 *   letra grande   el nombre del evento (puede ocupar dos líneas)
 *   bajo el QR     el código y «Válido para N personas»
 *   izquierda      la tarifa («Entrada por Lista»), precio y contenido
 *   derecha        el titular, su teléfono y su correo (no se guardan)
 *   abajo          UBICACIÓN y la dirección
 *
 * De cualquier otro PDF o captura sólo se fía del QR: lo demás lo completa la
 * persona a mano.
 */

/** Un trozo de texto de la página: `y` cuenta desde arriba, en puntos. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  /** Alto de la letra. */
  h: number;
  w: number;
}

export interface ImportedTicket {
  source: 'fourvenues' | 'other';
  qrText: string;
  code: string | null;
  eventName: string | null;
  organizer: string | null;
  /** «Entrada», «Lista», «Reserva»… */
  kind: string | null;
  ticketType: string | null;
  details: string | null;
  priceCents: number | null;
  people: number | null;
  holderName: string | null;
  address: string | null;
  /** Inicio en hora local, ISO (`2026-10-17T18:00`), sin zona. */
  startsLocal: string | null;
  /** «Cierre» o la hora de fin («06:00»). */
  endsLabel: string | null;
  /** Todo el texto leído (PDF o captura), para buscar la fiesta de Fiestea. No se guarda. */
  ocrText?: string;
}

const MESES: Record<string, number> = {
  ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7,
  AGO: 8, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12,
};

const limpia = (s: string) => s.replace(/\s+/g, ' ').trim();

/** «6:00 PM» → «18:00»; «23:30» se queda igual. */
export const hora24 = (texto: string): string | null => {
  const m = texto.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]\.?\s?M\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const pm = m[3] && /^p/i.test(m[3]);
  const am = m[3] && /^a/i.test(m[3]);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
};

/** «SÁB. 17 DE OCT. DE 2026» (o «SAT, OCT 17, 2026») → `2026-10-17`. */
export const fechaIso = (texto: string): string | null => {
  const t = texto.toUpperCase().replace(/[.,]/g, ' ');
  const dia = t.match(/\b(\d{1,2})\b/);
  const anio = t.match(/\b(20\d{2})\b/);
  const mes = Object.keys(MESES).find((k) => new RegExp(`\\b${k}\\b`).test(t));
  if (!dia || !anio || !mes) return null;
  return `${anio[1]}-${String(MESES[mes]).padStart(2, '0')}-${dia[1].padStart(2, '0')}`;
};

/** Agrupa trozos en líneas (misma altura en la página), de izquierda a derecha. */
const lineas = (items: PdfTextItem[]): { y: number; h: number; x: number; text: string }[] => {
  const ordenados = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: { y: number; h: number; x: number; parts: PdfTextItem[] }[] = [];
  for (const it of ordenados) {
    const linea = out.find((l) => Math.abs(l.y - it.y) <= 2);
    if (linea) linea.parts.push(it);
    else out.push({ y: it.y, h: it.h, x: it.x, parts: [it] });
  }
  return out.map((l) => {
    const parts = l.parts.sort((a, b) => a.x - b.x);
    return { y: l.y, h: Math.max(...parts.map((p) => p.h)), x: parts[0].x, text: limpia(parts.map((p) => p.str).join(' ')) };
  });
};

const CODIGO = /^[A-Z0-9]{6,14}$/;

/**
 * Interpreta una entrada a partir del texto de su primera página.
 *
 * @param items     Texto de la página 1 con posiciones (pdf.js).
 * @param pageWidth Ancho de la página, en puntos.
 * @param qrText    Contenido del QR, si se pudo leer.
 * @param fullText  Texto de todo el PDF (para reconocer la plataforma).
 */
export const parseTicket = (
  items: PdfTextItem[],
  pageWidth: number,
  qrText: string,
  fullText = '',
): ImportedTicket => {
  const visibles = items.filter((i) => i.str.trim());
  const mitad = pageWidth / 2;
  const todas = lineas(visibles);
  const fourvenues = /fourvenues/i.test(fullText) || /fourvenues/i.test(visibles.map((i) => i.str).join(' '));

  const resultado: ImportedTicket = {
    source: fourvenues ? 'fourvenues' : 'other',
    qrText,
    code: CODIGO.test(qrText.trim()) ? qrText.trim() : null,
    eventName: null,
    organizer: null,
    kind: null,
    ticketType: null,
    details: null,
    priceCents: null,
    people: null,
    holderName: null,
    address: null,
    startsLocal: null,
    endsLabel: null,
  };
  if (!fourvenues) return resultado;

  // Franja con la fecha: «TIPO … SÁB. 17 DE OCT. DE 2026 | 6:00 PM - CIERRE».
  const franja = todas.find((l) => fechaIso(l.text) && /\|/.test(l.text) && /\d{1,2}:\d{2}/.test(l.text));
  if (franja) {
    const [antes, despues = ''] = franja.text.split('|');
    const fecha = fechaIso(antes);
    const tipo = visibles
      .filter((i) => Math.abs(i.y - franja.y) <= 2 && i.x < pageWidth / 3)
      .map((i) => i.str)
      .join(' ');
    resultado.kind = tipo ? limpia(tipo).toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null;
    const [ini, fin] = despues.split(/\s-\s/);
    const h = ini ? hora24(ini) : null;
    if (fecha) resultado.startsLocal = `${fecha}T${h ?? '00:00'}`;
    if (fin) {
      const finH = hora24(fin);
      resultado.endsLabel = finH ?? limpia(fin).toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    }
  }

  // Organizador: lo más alto de la página.
  const arriba = todas.filter((l) => !franja || l.y < franja.y - 10);
  resultado.organizer = arriba.length ? arriba.map((l) => l.text).join(' ') : null;

  // Nombre del evento: la letra más grande (puede ir en dos líneas).
  const maxH = Math.max(...todas.map((l) => l.h));
  if (maxH >= 18) {
    resultado.eventName = limpia(todas.filter((l) => l.h >= maxH - 1).map((l) => l.text).join(' '));
  }

  // Código: el del QR o, si no se pudo leer, el texto con forma de código.
  if (!resultado.code) {
    const cod = todas.find((l) => CODIGO.test(l.text) && l.h >= 12);
    if (cod) resultado.code = cod.text;
  }

  // «Válido para N persona(s)».
  const valido = todas.find((l) => /v[áa]lido para/i.test(l.text));
  const n = valido?.text.match(/(\d+)\s*persona/i);
  if (n) resultado.people = Number(n[1]);

  // Dirección: lo que sigue a «UBICACIÓN».
  const ubic = todas.find((l) => /^ubicaci[óo]n$/i.test(l.text));
  if (ubic) {
    const dir = todas.filter((l) => l.y > ubic.y && l.y <= ubic.y + 30).map((l) => l.text);
    resultado.address = dir.length ? limpia(dir.join(' ')) : null;
  }

  // Columnas bajo «Válido para»: detalles a la izquierda, titular a la derecha.
  const desde = valido ? valido.y + 5 : 0;
  const hasta = ubic ? ubic.y - 2 : Infinity;
  const enBloque = visibles.filter((i) => i.y > desde && i.y < hasta);
  const izq = lineas(enBloque.filter((i) => i.x < mitad));
  const der = lineas(enBloque.filter((i) => i.x >= mitad));

  if (izq.length) {
    resultado.ticketType = izq[0].text;
    const resto: string[] = [];
    for (const l of izq.slice(1)) {
      const precio = l.text.match(/^precio:\s*([\d.,]+)\s*€?/i);
      if (precio) {
        const valor = Number(precio[1].replace(/\./g, '').replace(',', '.'));
        if (Number.isFinite(valor)) resultado.priceCents = Math.round(valor * 100);
        continue;
      }
      if (/^tasas e impuestos/i.test(l.text)) continue;
      resto.push(l.text.replace(/^contenido:\s*/i, ''));
    }
    resultado.details = resto.length ? limpia(resto.join(' ')) : null;
  }

  // Titular: la primera línea de la derecha que no es «Campo: valor».
  const titular = der.find((l) => !/:/.test(l.text));
  resultado.holderName = titular?.text ?? null;

  return resultado;
};

// ---------------------------------------------------------------------------
// Capturas (texto reconocido en el móvil con Tesseract)
// ---------------------------------------------------------------------------

/** Una línea reconocida en una captura: sus palabras con su posición. */
export interface OcrLine {
  text: string;
  /** Arriba de la línea, en píxeles desde arriba. */
  y: number;
  h: number;
  /** Confianza del reconocimiento, de 0 a 100. */
  conf: number;
  words: { text: string; x: number }[];
}

const DIA_SEMANA = /\b(lun|mar|mi[eé]|jue|vie|s[áa]b|dom|mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?/i;

/**
 * Interpreta la captura de una entrada (la web de Fourvenues u otra parecida):
 * la franja con la fecha, el nombre justo debajo, «Válido para N», la tarifa a
 * la izquierda y el titular a la derecha, y la dirección tras «UBICACIÓN».
 * Lo que no se lea lo completa la fiesta de Fiestea que se le asocie
 * (`matchEventText`).
 */
export const parseTicketOcr = (lines: OcrLine[], width: number, qrText: string): ImportedTicket => {
  // Las líneas con poca confianza son el QR, iconos o la barra del navegador.
  const fiables = lines.filter((l) => l.conf >= 50 && l.text.trim());
  const texto = fiables.map((l) => l.text).join('\n');
  const resultado: ImportedTicket = {
    source: /fourvenues/i.test(texto) ? 'fourvenues' : 'other',
    qrText,
    code: CODIGO.test(qrText.trim()) ? qrText.trim() : null,
    eventName: null,
    organizer: null,
    kind: null,
    ticketType: null,
    details: null,
    priceCents: null,
    people: null,
    holderName: null,
    address: null,
    startsLocal: null,
    endsLabel: null,
  };

  // Franja: «ENTRADA SÁB. 21 DE NOV. DE 2026 | 6:00 PM - 11:45 PM».
  const franja = fiables.find((l) => fechaIso(l.text) && /\d{1,2}:\d{2}/.test(l.text));
  if (franja) {
    const [antes, despues = ''] = franja.text.includes('|')
      ? franja.text.split('|')
      : [franja.text, franja.text.slice(franja.text.search(/\d{1,2}:\d{2}/))];
    const fecha = fechaIso(antes);
    const inicioFecha = antes.search(DIA_SEMANA);
    const tipo = inicioFecha > 0 ? limpia(antes.slice(0, inicioFecha)) : '';
    if (tipo && /^[a-záéíóúñ ]{3,20}$/i.test(tipo)) resultado.kind = tipo.toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    const horas = despues.match(/\d{1,2}:\d{2}\s*(?:[AP]\.?\s?M\.?)?/gi) ?? [];
    const ini = horas[0] ? hora24(horas[0]) : null;
    if (fecha) resultado.startsLocal = `${fecha}T${ini ?? '00:00'}`;
    if (horas[1]) resultado.endsLabel = hora24(horas[1]);
    else if (/cierre|close/i.test(despues)) resultado.endsLabel = 'Cierre';
  }

  // Organizador: lo que va antes de «powered by» en la cabecera de Fourvenues. El
  // reconocimiento a veces se come «powered» («Y AMOK by 4 fourvenues»): vale
  // cualquier línea con «by … fourvenues», y se quita el logo leído como letras.
  const cabecera = fiables.find((l) => /powered\s+b|\bby\b.*fourvenues/i.test(l.text));
  if (cabecera) {
    const antes = cabecera.text.split(/\bpowered\b|\bby\b|\|/i)[0];
    const org = limpia(
      antes
        .split(/\s+/)
        .map((p) => p.replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+|[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+$/g, ''))
        .filter((p, i, todas) => p && !(p.length <= 2 && i < todas.length - 1))
        .join(' '),
    );
    if (org.length >= 2) resultado.organizer = org;
  }

  // Nombre: la primera línea clara bajo la franja (o, si la franja no se leyó,
  // bajo la cabecera) que no es un código ni «Válido para».
  const desdeY = franja?.y ?? cabecera?.y;
  if (desdeY !== undefined) {
    const nombre = fiables.find(
      (l) =>
        l.y > desdeY &&
        l.conf >= (franja ? 70 : 85) &&
        /[a-záéíóúñ]{3}/i.test(l.text) &&
        !CODIGO.test(l.text.trim()) &&
        !/fourvenues|powered/i.test(l.text),
    );
    if (nombre && !/v[áa]lido para/i.test(nombre.text)) resultado.eventName = limpia(nombre.text);
  }

  if (!resultado.code) {
    const cod = fiables.find((l) => CODIGO.test(l.text.trim()));
    if (cod) resultado.code = cod.text.trim();
  }

  const valido = fiables.find((l) => /v[áa]lido para/i.test(l.text));
  const n = valido?.text.match(/(\d+)\s*persona/i);
  if (n) resultado.people = Number(n[1]);

  const ubic = fiables.find((l) => /^ubicaci[óo]n\b/i.test(l.text.trim()));
  if (ubic) {
    const dir = fiables.find((l) => l.y > ubic.y);
    if (dir) resultado.address = limpia(dir.text);
  }

  // Bajo «Válido para»: tarifa y precio a la izquierda, titular a la derecha.
  if (valido) {
    const mitad = width / 2;
    const bloque = fiables.filter((l) => l.y > valido.y && (!ubic || l.y < ubic.y));
    const izq = (l: OcrLine) => limpia(l.words.filter((w) => w.x < mitad).map((w) => w.text).join(' '));
    const der = (l: OcrLine) => limpia(l.words.filter((w) => w.x >= mitad).map((w) => w.text).join(' '));
    if (bloque[0]) {
      resultado.ticketType = izq(bloque[0]) || null;
      const titular = der(bloque[0]);
      if (titular && !/:/.test(titular)) resultado.holderName = titular;
    }
    const detalles: string[] = [];
    for (const l of bloque.slice(1)) {
      const t = izq(l);
      const precio = t.match(/precio:?\s*([\d.,]+)\s*€?/i);
      if (precio) {
        const valor = Number(precio[1].replace(/\./g, '').replace(',', '.'));
        if (Number.isFinite(valor)) resultado.priceCents = Math.round(valor * 100);
        continue;
      }
      if (!t || /^tasas e impuestos/i.test(t) || /^email|^tel[ée]fono/i.test(t)) continue;
      detalles.push(t.replace(/^contenido:\s*/i, ''));
    }
    resultado.details = detalles.length ? limpia(detalles.join(' ')) : null;
  }

  return resultado;
};
