import { googleAccessToken, googleServiceAccount, signGoogleJwt } from './google-auth.ts';
import type { TicketPdfData } from './ticket-pdf.ts';

/**
 * Pase de Google Wallet para una entrada.
 *
 * Cada fiesta es una clase (`eventTicketClass`) y cada entrada un objeto
 * (`eventTicketObject`) con el QR de la puerta. Los dos se crean o se ponen al
 * día con la API REST y luego se firma un JWT corto que sólo lleva el id del
 * objeto: el enlace `pay.google.com/gp/v/save/<jwt>` abre «Guardar en Google
 * Wallet» en el móvil.
 *
 * Secretos: `GOOGLE_WALLET_SERVICE_ACCOUNT_JSON` (cuenta de servicio del
 * proyecto de Google Cloud «Fiestea», invitada como Desarrollador en la consola
 * de Wallet) y `GOOGLE_WALLET_ISSUER_ID`. Mientras Google no apruebe la
 * publicación, sólo las cuentas de prueba de la consola pueden guardar pases.
 */

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const LOGO = 'https://fiestea.es/icons/icon-512.png';
const FONDO = '#111114';

const issuer = () => (Deno.env.get('GOOGLE_WALLET_ISSUER_ID') ?? '').trim();

export const googleWalletConfigured = () => Boolean(issuer()) && googleServiceAccount('wallet') !== null;

/** Texto en español: los pases se leen en el idioma del móvil, pero sólo damos este. */
const es = (value: string) => ({ defaultValue: { language: 'es', value } });

/** Los ids sólo admiten letras, números, `.`, `_` y `-`. */
const limpio = (s: string) => s.replace(/[^\w.-]/g, '_');

const imagen = (uri: string, descripcion: string) => ({
  sourceUri: { uri },
  contentDescription: es(descripcion),
});

const upsert = async (tipo: 'eventTicketClass' | 'eventTicketObject', id: string, body: Record<string, unknown>) => {
  const headers = {
    Authorization: `Bearer ${await googleAccessToken(SCOPE, 'wallet')}`,
    'Content-Type': 'application/json',
  };
  const cuerpo = JSON.stringify(body);
  let r = await fetch(`${API}/${tipo}`, { method: 'POST', headers, body: cuerpo });
  // Ya existía: se pone al día (la fiesta puede haber cambiado de hora o de cartel).
  if (r.status === 409) r = await fetch(`${API}/${tipo}/${encodeURIComponent(id)}`, { method: 'PUT', headers, body: cuerpo });
  if (!r.ok) throw new Error(`Google Wallet ${tipo}: ${r.status} ${(await r.text()).slice(0, 500)}`);
};

/** Enlace «Guardar en Google Wallet» de una entrada del pedido. */
export const googleWalletSaveUrl = async (data: TicketPdfData, code: string): Promise<string> => {
  const ticket = data.tickets.find((t) => t.code === code);
  if (!ticket) throw new Error('TICKET_NOT_FOUND');
  const emisor = issuer();
  const cuenta = googleServiceAccount('wallet');
  if (!emisor || !cuenta) throw new Error('GOOGLE_WALLET_NOT_CONFIGURED');

  const tipo = data.kind === 'table' ? 'Mesa VIP' : data.kind === 'vip' ? 'Entrada VIP' : 'Entrada';
  const classId = `${emisor}.fiesta_${limpio(data.eventId)}`;
  const objectId = `${emisor}.${limpio(code)}`;
  const nota = 'Entrada nominal. Enseña el QR en la puerta. Cada código vale una sola vez.';

  await upsert('eventTicketClass', classId, {
    id: classId,
    issuerName: 'Fiestea',
    reviewStatus: 'UNDER_REVIEW',
    eventName: es(data.eventName),
    venue: {
      name: es(data.venueName),
      address: es(data.address ?? data.placeLine ?? data.venueCity ?? data.venueName),
    },
    dateTime: { start: data.startDate, end: data.endDate },
    logo: imagen(LOGO, 'Fiestea'),
    ...(data.posterUrl?.startsWith('https://') ? { heroImage: imagen(data.posterUrl, data.eventName) } : {}),
    hexBackgroundColor: FONDO,
    finePrint: es(`Entrada vendida por ${data.venueName} a través de Fiestea. ${nota}`),
  });

  const extras = [
    data.description ? { id: 'incluye', header: 'Incluye', body: data.description } : null,
    data.minAge ? { id: 'edad', header: 'Edad mínima', body: `${data.minAge} años` } : null,
    data.dressCode ? { id: 'dress', header: 'Dress code', body: data.dressCode } : null,
    { id: 'nota', header: 'Importante', body: nota },
  ].filter(Boolean);

  await upsert('eventTicketObject', objectId, {
    id: objectId,
    classId,
    state: 'ACTIVE',
    ticketNumber: code,
    ...(ticket.holderName ? { ticketHolderName: ticket.holderName } : {}),
    ticketType: es(`${tipo} · ${data.typeName}`),
    barcode: { type: 'QR_CODE', value: code, alternateText: code },
    hexBackgroundColor: FONDO,
    // Pasado el final (más seis horas, como el de Apple), pasa a «caducados».
    validTimeInterval: { end: { date: new Date(new Date(data.endDate).getTime() + 6 * 3_600_000).toISOString() } },
    textModulesData: extras,
  });

  const jwt = await signGoogleJwt(
    {
      iss: cuenta.clientEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [],
      payload: { eventTicketObjects: [{ id: objectId }] },
    },
    'wallet',
  );
  return `https://pay.google.com/gp/v/save/${jwt}`;
};
