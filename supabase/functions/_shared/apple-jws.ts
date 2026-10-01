import * as x509 from 'npm:@peculiar/x509@1.12.3';
import { compactVerify, decodeProtectedHeader, importX509 } from 'npm:jose@5.9.6';

/**
 * Verifica lo que firma Apple con StoreKit 2 y App Store Server Notifications
 * (JWS con la cadena de certificados en `x5c`).
 *
 * Comprueba que:
 *   · la raíz de la cadena es Apple Root CA - G3 (por su huella SHA-256,
 *     sacada de apple.com/certificateauthority);
 *   · el intermedio lo firma la raíz y la hoja lo firma el intermedio, y los
 *     dos llevan las extensiones de Apple para compras;
 *   · el JWS lo firma la hoja (ES256).
 *
 * No se usa ninguna clave nuestra: lo que se confía es la firma de Apple.
 */

x509.cryptoProvider.set(crypto);

const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';
/** Certificado de firma de recibos de la App Store (hoja). */
const OID_LEAF = '1.2.840.113635.100.6.11.1';
/** Apple Worldwide Developer Relations (intermedio). */
const OID_INTERMEDIATE = '1.2.840.113635.100.6.2.1';

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const der = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export class AppleJwsError extends Error {}

export const verifyAppleJws = async <T = Record<string, unknown>>(jws: string): Promise<T> => {
  if (typeof jws !== 'string' || jws.split('.').length !== 3) throw new AppleJwsError('BAD_JWS');

  const header = decodeProtectedHeader(jws);
  const chain = header.x5c;
  if (header.alg !== 'ES256' || !Array.isArray(chain) || chain.length !== 3) {
    throw new AppleJwsError('BAD_CHAIN');
  }

  const raiz = der(chain[2]);
  if (hex(await crypto.subtle.digest('SHA-256', raiz)) !== APPLE_ROOT_G3_SHA256) {
    throw new AppleJwsError('UNTRUSTED_ROOT');
  }

  const [hoja, intermedio, root] = chain.map((c) => new x509.X509Certificate(der(c)));
  if (!hoja.getExtension(OID_LEAF) || !intermedio.getExtension(OID_INTERMEDIATE)) {
    throw new AppleJwsError('BAD_CHAIN');
  }
  const intermedioOk = await intermedio.verify({ publicKey: root.publicKey, signatureOnly: true });
  const hojaOk = await hoja.verify({ publicKey: intermedio.publicKey, signatureOnly: true });
  if (!intermedioOk || !hojaOk) throw new AppleJwsError('BAD_SIGNATURE');

  const clave = await importX509(hoja.toString('pem'), 'ES256');
  const { payload } = await compactVerify(jws, clave);
  return JSON.parse(new TextDecoder().decode(payload)) as T;
};

/** Transacción de StoreKit 2 (lo que usamos de ella). */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  expiresDate?: number;
  quantity?: number;
  type: string;
  appAccountToken?: string;
  environment: 'Sandbox' | 'Production' | string;
  /** En milésimas de la moneda (4990 = 4,99). */
  price?: number;
  currency?: string;
  revocationDate?: number;
}

export interface AppleRenewalInfo {
  originalTransactionId: string;
  productId: string;
  autoRenewStatus: 0 | 1;
}

/** Identificadores de la app en las tiendas (las dos marcas usan el mismo backend). */
export const APPLE_BUNDLE_IDS = (Deno.env.get('APPLE_BUNDLE_IDS') ?? 'es.fiestea.app')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export type AppleProduct = 'monthly' | 'event' | 'supercrush';

/** `es.fiestea.app.premium.monthly` → `monthly`. */
export const productKind = (bundleId: string, productId: string): AppleProduct | null => {
  if (!productId.startsWith(`${bundleId}.`)) return null;
  const sufijo = productId.slice(bundleId.length + 1);
  if (sufijo === 'premium.monthly') return 'monthly';
  if (sufijo === 'premium.event') return 'event';
  if (sufijo === 'supercrush') return 'supercrush';
  return null;
};
