# Fiestea (`vybe-project`)

App Vite de **Fiestea**. Documentación completa: **`../CLAUDE.md`**.

## Arranque

```bash
npm install && npm run dev   # :5173
# .env.local: ver .env.example
```

Migraciones en `supabase/migrations/`, en orden **001 → 002 → 003 → 006 → 007 →
008 → … hasta la última**, y después el seed opcional **005 → 004**. De la 006 en adelante
son obligatorias: las 008–013 corrigen la deriva entre lo que declaran las
migraciones y lo que hay de verdad en la base de datos, y la **028 cierra las
columnas con privilegio** (`role`, `is_verified`…), que hasta entonces podía
escribir cualquiera con la anon key.

## Comprobación

```bash
npm run verify   # typecheck + lint + tests + build
```

## MCPs

`supabase` (proyecto `vipixvfplxownccuhrme`) y `sentry`, definidos en el
`.mcp.json` de la carpeta padre. El CLI está autenticado con **otra cuenta**: las
migraciones van por MCP y las funciones con `node scripts/run-supabase.mjs
functions deploy`.

## Docs

`SETUP.md`, `CREAR_USUARIOS.md`, `ESTADO.md`
