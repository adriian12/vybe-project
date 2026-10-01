/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { readFileSync } from "node:fs";

/**
 * Identificador de la versión, para que Sentry agrupe los errores por
 * despliegue y se pueda ver si un fallo apareció con el último cambio.
 */
const release = `vybe@${JSON.parse(readFileSync("./package.json", "utf8")).version}+${Date.now()
  .toString(36)}`;

/**
 * Todo lo que empieza por VITE_ acaba dentro del JavaScript público (web y APK).
 * El «API Access Token» del Workspace de CARTO es un JWT (`eyJ…`) que da acceso a
 * los datos de la cuenta; la clave de mapas de carto.com/basemaps/apikey no lo
 * es. Confundirlas publicaría el token, así que la compilación se para.
 */
const comprobarVariablesPublicas = (mode: string) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (env.VITE_CARTO_API_KEY?.startsWith("eyJ")) {
    throw new Error(
      "VITE_CARTO_API_KEY tiene un API Access Token de CARTO (privado). " +
        "Pon ahí la clave de https://carto.com/basemaps/apikey y el token en CARTO_API_TOKEN.",
    );
  }
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => (comprobarVariablesPublicas(mode), {
  server: {
    host: "::",
    // 5173 es el puerto que documentan README.md, SETUP.md y la configuración
    // de Redirect URLs de Supabase. Antes el servidor arrancaba en el 8080 y la
    // verificación de email redirigía a un puerto donde no había nada.
    port: 5173,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // `npm run dev:https` sirve por HTTPS con un certificado autofirmado.
    //
    // Hace falta para probar desde el móvil: la cámara (escáner QR y fotos) y
    // la geolocalización sólo funcionan en un origen seguro, y `localhost` lo
    // es pero `http://192.168.x.x` no. El navegador avisará de que el
    // certificado no es de confianza; hay que aceptar la excepción una vez.
    process.env.VYBE_HTTPS === "true" && basicSsl(),
    // Sube los source maps a Sentry para que las trazas de producción se lean.
    // Sin el token no se activa: es opcional y no puede romper el build de
    // quien no lo tenga configurado.
    mode === "production" &&
      process.env.SENTRY_AUTH_TOKEN &&
      process.env.SENTRY_ORG &&
      process.env.SENTRY_PROJECT &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: release },
        // Los mapas se borran del directorio de salida después de subirlos:
        // publicarlos dejaría el código fuente al alcance de cualquiera.
        sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
      }),
    VitePWA({
      registerType: "prompt",
      // El service worker propio maneja las notificaciones push; Workbox lo
      // inyecta dentro para no tener dos workers compitiendo por el scope.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
      },
      manifest: {
        name: "Fiestea",
        short_name: "Fiestea",
        description: "Conecta con la gente que está en la misma fiesta que tú.",
        lang: "es",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#111114",
        theme_color: "#111114",
        categories: ["social", "lifestyle", "entertainment"],
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_RELEASE__: JSON.stringify(release),
  },
  build: {
    // "hidden": genera los mapas para subirlos a Sentry pero no los enlaza
    // desde los ficheros servidos.
    sourcemap: mode === "production" ? "hidden" : false,
    rollupOptions: {
      output: {
        // El bundle superaba 1 MB en un solo chunk. Separar las dependencias
        // pesadas permite cachearlas entre despliegues.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          scanner: ["html5-qrcode"],
          i18n: ["i18next", "react-i18next"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/services/**", "src/lib/**", "src/context/**"],
    },
  },
}));
