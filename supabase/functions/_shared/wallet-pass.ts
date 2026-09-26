import forge from 'npm:node-forge@1.3.1';
import { zipSync } from 'npm:fflate@0.8.2';
import type { TicketPdfData } from './ticket-pdf.ts';

/**
 * Pase de Apple Wallet (.pkpass) para una entrada (migración 077).
 *
 * Un .pkpass es un zip con `pass.json`, las imágenes, `manifest.json` (el
 * SHA-1 de cada fichero) y `signature` (firma PKCS#7 del manifiesto con el
 * certificado del Pass Type ID `pass.es.fiestea.tickets` y el intermedio WWDR
 * G4 de Apple). Secretos: PASS_TYPE_ID, PASS_TEAM_ID, PASS_CERT_PEM,
 * PASS_KEY_PEM y PASS_WWDR_PEM.
 */

export const walletConfigured = () =>
  ['PASS_TYPE_ID', 'PASS_TEAM_ID', 'PASS_CERT_PEM', 'PASS_KEY_PEM', 'PASS_WWDR_PEM'].every((k) => Boolean(Deno.env.get(k)));

const ICONO = 'https://fiestea.es/icons/icon-192.png';

const sha1 = (bytes: Uint8Array) => {
  const md = forge.md.sha1.create();
  md.update(forge.util.binary.raw.encode(bytes));
  return md.digest().toHex();
};

const firmar = (manifest: Uint8Array): Uint8Array => {
  const cert = forge.pki.certificateFromPem(Deno.env.get('PASS_CERT_PEM')!);
  const key = forge.pki.privateKeyFromPem(Deno.env.get('PASS_KEY_PEM')!);
  const wwdr = forge.pki.certificateFromPem(Deno.env.get('PASS_WWDR_PEM')!);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(forge.util.binary.raw.encode(manifest));
  p7.addCertificate(cert);
  p7.addCertificate(wwdr);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.binary.raw.decode(der);
};

const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(new Date(iso));

export const buildWalletPass = async (
  data: TicketPdfData,
  code: string,
  location: { latitude: number; longitude: number } | null,
): Promise<Uint8Array> => {
  const ticket = data.tickets.find((t) => t.code === code);
  if (!ticket) throw new Error('TICKET_NOT_FOUND');

  const tipo = data.kind === 'table' ? 'Mesa VIP' : data.kind === 'vip' ? 'Entrada VIP' : 'Entrada';
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: Deno.env.get('PASS_TYPE_ID'),
    teamIdentifier: Deno.env.get('PASS_TEAM_ID'),
    serialNumber: code,
    organizationName: 'Fiestea',
    description: `${tipo} · ${data.eventName}`,
    logoText: data.venueName,
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(17, 17, 20)',
    labelColor: 'rgb(248, 208, 0)',
    relevantDate: data.startDate,
    expirationDate: new Date(new Date(data.endDate).getTime() + 6 * 3_600_000).toISOString(),
    ...(location ? { locations: [{ latitude: location.latitude, longitude: location.longitude, relevantText: data.eventName }] } : {}),
    barcodes: [{ format: 'PKBarcodeFormatQR', message: code, messageEncoding: 'iso-8859-1', altText: code }],
    eventTicket: {
      headerFields: [{ key: 'fecha', label: 'CUÁNDO', value: fecha(data.startDate) }],
      primaryFields: [{ key: 'evento', label: tipo.toUpperCase(), value: data.eventName }],
      secondaryFields: [
        { key: 'nombre', label: 'NOMBRE', value: ticket.holderName ?? '—' },
        { key: 'tipo', label: 'TIPO', value: data.typeName },
      ],
      auxiliaryFields: [{ key: 'lugar', label: 'DÓNDE', value: data.placeLine ?? data.address ?? data.venueName }],
      backFields: [
        ...(data.description ? [{ key: 'incluye', label: 'Incluye', value: data.description }] : []),
        ...(data.minAge ? [{ key: 'edad', label: 'Edad mínima', value: `${data.minAge} años` }] : []),
        ...(data.dressCode ? [{ key: 'dress', label: 'Dress code', value: data.dressCode }] : []),
        { key: 'codigo', label: 'Código', value: code },
        { key: 'nota', label: 'Importante', value: 'Entrada nominal. Enseña el QR en la puerta. Cada código vale una sola vez.' },
      ],
    },
  };

  const icono = new Uint8Array(await (await fetch(ICONO)).arrayBuffer());
  const ficheros: Record<string, Uint8Array> = {
    'pass.json': new TextEncoder().encode(JSON.stringify(pass)),
    'icon.png': icono,
    'icon@2x.png': icono,
    'logo.png': icono,
    'logo@2x.png': icono,
  };
  const manifest = new TextEncoder().encode(
    JSON.stringify(Object.fromEntries(Object.entries(ficheros).map(([n, b]) => [n, sha1(b)]))),
  );
  return zipSync({ ...ficheros, 'manifest.json': manifest, signature: firmar(manifest) }, { level: 6 });
};
