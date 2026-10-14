import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import decodeAvif, { init as initAvif } from '@jsquash/avif/decode.js';
import sharp from 'sharp';
import { DEFAULT_IMAGE, SUPABASE_URL, eventIdOf, loadEventShare } from './_share.js';

/**
 * La imagen de la vista previa de una fiesta: 1200 × 630 en JPG, con el cartel
 * entero en el centro sobre una versión desenfocada y oscura de sí mismo.
 *
 * Hace falta convertirlo aquí porque casi todos los carteles (los de Funout)
 * son AVIF, que WhatsApp no enseña, y los que sube el negocio pueden pesar
 * varios MB. Muchos de esos AVIF son AV1 de perfil 1 a 10 bits, que el libaom
 * de `sharp` no abre: los AVIF se decodifican con dav1d (`@jsquash/avif`, en
 * WebAssembly) y `sharp` hace el resto. Sólo se descarga el `poster_url` de la fiesta, y sólo de los
 * sitios de donde salen los carteles: el id viene de fuera, la URL no.
 */

const ANCHO = 1200;
const ALTO = 630;
const MAX_BYTES = 15 * 1024 * 1024;

const HOSTS = ['funout.es', 'images.unsplash.com', SUPABASE_URL ? new URL(SUPABASE_URL).host : ''].filter(Boolean);

const permitido = (raw: string): URL | null => {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    return HOSTS.some((h) => u.host === h || u.host.endsWith(`.${h}`)) ? u : null;
  } catch {
    return null;
  }
};

const porDefecto = () => Response.redirect(DEFAULT_IMAGE, 302);

let avifListo: Promise<void> | null = null;
const prepararAvif = () =>
  (avifListo ??= (async () => {
    const require = createRequire(import.meta.url);
    const wasm = readFileSync(require.resolve('@jsquash/avif/codec/dec/avif_dec.wasm'));
    await initAvif(await WebAssembly.compile(wasm));
  })());

/** `ftyp` con marca `avif` o `avis` en los primeros bytes. */
const esAvif = (b: Uint8Array) => {
  const cab = new TextDecoder('latin1').decode(b.subarray(4, 32));
  return cab.startsWith('ftyp') && /avi[fs]/.test(cab);
};

const abrir = async (bytes: Uint8Array) => {
  if (!esAvif(bytes)) return sharp(bytes, { limitInputPixels: 50_000_000 }).rotate();
  await prepararAvif();
  const img = await decodeAvif(bytes);
  if (!img) throw new Error('AVIF ilegible');
  return sharp(new Uint8Array(img.data.buffer), { raw: { width: img.width, height: img.height, channels: 4 } });
};

export async function GET(request: Request): Promise<Response> {
  const id = eventIdOf(request);
  const ev = id ? await loadEventShare(id) : null;
  const url = ev?.poster_url ? permitido(ev.poster_url) : null;
  if (!url) return porDefecto();

  try {
    // Funout rechaza los agentes de navegador que llegan desde un servidor.
    const res = await fetch(url, { headers: { 'User-Agent': 'Fiestea/1.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return porDefecto();
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) return porDefecto();
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return porDefecto();

    const cartel = await abrir(bytes);
    const fondo = await cartel
      .clone()
      .resize(ANCHO, ALTO, { fit: 'cover' })
      .blur(40)
      .modulate({ brightness: 0.4 })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const delante = await cartel
      .clone()
      .resize(ANCHO, ALTO, { fit: 'inside' })
      // Los pasos intermedios en PNG: con un AVIF la entrada es `raw` y
      // `sharp` devolvería también `raw`, que el paso siguiente no sabe leer.
      .png({ compressionLevel: 0 })
      .toBuffer();
    const jpg = await sharp(fondo)
      .composite([{ input: delante, gravity: 'center' }])
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    return new Response(new Uint8Array(jpg), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    });
  } catch {
    return porDefecto();
  }
}
