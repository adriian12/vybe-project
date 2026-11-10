<!-- generado-desde-claude-md -->
<!-- Copia de Fiestea/vybe-project/CLAUDE.md hecha por D:/Webs/sync-gemini.mjs. No la edites aquí:
     cambia CLAUDE.md y ejecuta `node D:/Webs/sync-gemini.mjs`. -->

# Instrucciones del proyecto (para Gemini / Antigravity)

Son las mismas instrucciones que sigue Claude Code en esta carpeta. Léelas
enteras antes de tocar nada y síguelas igual:

- Responde siempre en **español**.
- Donde diga «Claude» o «Claude Code», entiende que se refiere a ti.
- Las *skills* (`/apk`, `/ipa`, `/graphify`…), los servidores MCP, las tareas
  programadas y la memoria son de Claude Code: puede que aquí no existan. Si
  una instrucción depende de ellos, haz el paso a mano con la terminal o avisa
  de que no puedes, pero no te lo saltes en silencio.
- Si este proyecto tiene notas aparte (por ejemplo `docs/notas/`), lee la del
  tema antes de cambiar código, igual que dice el texto de abajo.

---

# Fiestea (`vybe-project`)

La documentación de trabajo está en **`../CLAUDE.md`** (reglas generales) y en
**`docs/notas/`** (una nota por tema: base de datos, negocio, entradas, pagos…).

```bash
npm install && npm run dev   # :5173 (.env.local: ver .env.example)
npm run verify               # tipos + lint + tests + build
```

Migraciones en `supabase/migrations/`, en orden y por MCP o la Management API
(nunca `db push`). Proyecto `vipixvfplxownccuhrme`. Más en `SETUP.md`.
