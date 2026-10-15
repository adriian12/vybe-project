## graphify

El código tiene un grafo de conocimiento (símbolos, imports, llamadas y las
funciones y tablas de las migraciones SQL) en **`vybe-project/graphify-out/`**.
La variable `GRAPHIFY_OUT` de `.claude/settings.json` apunta ahí, así que
`graphify` funciona igual desde la raíz que desde `vybe-project/`.

**Antes de leer ficheros enteros o buscar con grep, pregunta al grafo:**

- `graphify query "<pregunta>"`: el subgrafo relevante para una pregunta de
  arquitectura o de «dónde se hace X». Con `--budget 800` sale más corto.
- `graphify explain "<símbolo>"`: qué es un nodo, dónde está (fichero y
  línea) y con qué se conecta. Por ejemplo `graphify explain "useVenueSos()"` o
  `graphify explain "resolve_sos_alert"`.
- `graphify path "<A>" "<B>"`: cómo se conectan dos símbolos.
- `graphify affected "<símbolo>"`: qué se ve afectado si lo cambias.
- `vybe-project/graphify-out/GRAPH_REPORT.md`: sólo para una visión general
  (nodos centrales y comunidades).

Con el grafo ya orientado, se abre con Read **sólo el tramo** que hay que
tocar (`offset`/`limit`). Grep sigue siendo lo correcto para textos literales:
claves de i18n, mensajes de error, nombres de columnas.

**Lo que el grafo no ve:**
- Las llamadas `supabase.rpc('nombre')` y `.from('tabla')` son cadenas, así
  que no hay arista entre el cliente y la función SQL. Para eso busca con Grep
  el nombre de la RPC.
- Los JSON de i18n, los `.md` y las imágenes no están indexados (sólo código).

**Mantenerlo al día:**
- Un hook de git (`post-commit` y `post-checkout`) lo actualiza solo tras cada
  commit y al cambiar entre `main` y `fiestea`.
- Tras cambios grandes sin commit, o si `explain` no encuentra algo nuevo:
  `cd vybe-project && graphify update .`. Es sólo AST y no gasta tokens.
- **Nunca** ejecutes `graphify update .` ni `graphify extract .` desde la raíz
  `D:\Webs\Vybe App`: indexaría los mockups y diseños en el mismo grafo.
- Reconstruirlo desde cero:
  `cd vybe-project && rm -rf graphify-out && graphify extract . --code-only --no-label && graphify cluster-only . --no-label`.
- Para indexar las 68 migraciones SQL hace falta el extra `sql`
  (`uv tool install --force "graphifyy[sql]"`); ya está instalado.

**Hooks de Claude Code** (`.claude/settings.json`, `PreToolUse`): antes de un
`grep`/`find` por Bash o de un Read/Glob de código, `graphify hook-guard`
recuerda que el grafo existe. Nunca bloquea la herramienta.
