#!/usr/bin/env node
/**
 * Parche de `@capgo/native-purchases` (iOS), aplicado en cada `npm install` /
 * `npm ci` (`postinstall`), también en Codemagic.
 *
 * El plugin compra con `product.purchase(options:)`, sin decir en qué ventana
 * enseñar la hoja de pago. En el iPhone funciona, pero Apple revisa también en
 * iPad (una app de iPhone se ejecuta allí en modo compatible) y el 10-11-2026
 * rechazó la 1.0 porque la suscripción daba error en un iPad Air con iPadOS 27.
 * Desde iOS 17 Apple pide `purchase(confirmIn: escena, options:)`; ninguna
 * versión del plugin lo hace todavía (comprobado hasta la 8.9.7).
 *
 * Si el plugin cambia y el texto ya no aparece, el script avisa y no toca nada:
 * hay que revisar a mano si la versión nueva ya usa `confirmIn`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fichero = resolve(root, 'node_modules/@capgo/native-purchases/ios/Sources/NativePurchasesPlugin/NativePurchasesPlugin.swift');
const MARCA = '// fiestea: confirmIn';

if (!existsSync(fichero)) process.exit(0); // instalación sin el plugin (p. ej. sólo web)

const antes = '                let result = try await product.purchase(options: purchaseOptions)';
const despues = `                ${MARCA} (scripts/parchear-native-purchases.mjs)
                let result: Product.PurchaseResult
                let escenas = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
                if #available(iOS 17.0, *),
                   let escena = escenas.first(where: { $0.activationState == .foregroundActive }) ?? escenas.first {
                    result = try await product.purchase(confirmIn: escena, options: purchaseOptions)
                } else {
                    result = try await product.purchase(options: purchaseOptions)
                }`;

const texto = readFileSync(fichero, 'utf8');
if (texto.includes(MARCA)) process.exit(0);
if (!texto.includes(antes)) {
  console.warn('[parche native-purchases] No encuentro la compra de StoreKit: revisa si la versión nueva ya usa confirmIn.');
  process.exit(0);
}
writeFileSync(fichero, texto.replace(antes, despues));
console.log('[parche native-purchases] Compra de iOS con confirmIn aplicada.');
