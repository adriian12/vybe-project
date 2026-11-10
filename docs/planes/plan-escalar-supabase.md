# Plan · Ampliar Supabase (Pro y servidor Small)

Para cuando Fiestea tenga fiestas reales. Se basa en la prueba de carga del
10-11-2026 (`docs/notas/pruebas.md`). Las cifras de precios y límites son las
publicadas por Supabase en noviembre de 2026: **confírmalas en
<https://supabase.com/pricing> y en <https://supabase.com/docs/guides/platform/compute-and-disk>
antes de contratar**.

| Fase | Qué | Cuándo | Coste aprox. | Depende de ti |
|------|-----|--------|--------------|---------------|
| 1 | Pasar la organización a **Pro** | Al salir a producción con fiestas reales | 25 $/mes (incluye el Micro) | Sí: contratar |
| 2 | Ajustes de Pro (límites de Realtime, login, copias) | El mismo día | 0 € | Lo hago yo, con tu visto bueno |
| 3 | Subir el servidor a **Small** | Cuando se cumpla alguna señal de abajo | ≈ 5 $/mes más (15 $ − 10 $ de crédito) | Sí: contratar |
| 4 | Repetir la prueba de carga con 300-500 fiester@s | Tras cada salto | 0 € | No |

---

## Dónde estamos

- Proyecto `vipixvfplxownccuhrme`, región **eu-north-1 (Estocolmo)**, servidor
  **Nano** (plan gratuito): 0,5 GB de RAM, CPU compartida, 60 conexiones.
- Medido con 100 fiester@s: el recorrido entero a ritmo humano va bien (64
  peticiones/s, mediana 106 ms). Con los arreglos del 10-11 (lista de fiestas
  más ligera y reintento del chat), el techo del Nano no es la CPU sino el
  **límite de 200 conexiones de tiempo real** del plan gratuito.

| | Gratis · Nano | Pro · Micro | Pro · Small |
|---|---|---|---|
| RAM / CPU | 0,5 GB, compartida | 1 GB, 2 núcleos ARM compartidos | 2 GB, 2 núcleos ARM compartidos |
| Conexiones a Postgres | 60 | 60 | 90 |
| Conexiones de tiempo real | **200** | 500 (ampliable) | 500 (ampliable) |
| Mensajes de tiempo real | 100/s | 500/s | 500/s |
| Se pausa sin actividad | Sí, a la semana | No | No |
| Copias de seguridad | No | Diarias, 7 días | Diarias, 7 días |
| Personas con la app abierta (estimado) | ~200 | ~500 | ~800-1.000 activas |

---

## Fase 1 · Pasar a Pro

**Señal:** el día que haya fiestas reales con gente dentro, sin esperar a más.
Sólo por no pausarse y por las copias diarias ya compensa.

**Cómo (lo haces tú, son 2 minutos):**

1. <https://supabase.com/dashboard> → la organización donde está Fiestea →
   **Billing** (Facturación).
2. **Change subscription plan** → **Pro** → añade la tarjeta → confirma.
3. Deja activado el **Spend Cap** (tope de gasto) al principio: así nunca
   se cobra más de lo del plan; si se pasa un límite, se frena en vez de
   facturar. Quítalo sólo cuando quieras que crezca sin cortes (fase 2).

No hay corte: el proyecto sigue igual, con el **Micro** incluido. Ojo: la
organización también tiene los proyectos de Stampbook y We love tattoo si están
en la misma; Pro se paga **por organización** y el crédito de servidor es **por
proyecto** (cada proyecto activo pasa a cobrar su servidor). Antes de
contratar, comprueba en Billing qué proyectos hay en esa organización.

---

## Fase 2 · Ajustes tras pasar a Pro

Lo hago yo cuando me lo digas:

- **Tiempo real:** comprobar en *Project Settings → Realtime* el límite de
  conexiones (500) y subirlo si hace falta. Por encima de 500 se cobra aparte
  y exige quitar el Spend Cap.
- **Login por IP:** *Authentication → Rate Limits*, «Sign ups and sign ins»
  de ~30 a ~100 cada 5 min, por el wifi compartido de los locales (toda la
  sala sale con la misma IP).
- **Copias:** comprobar que salen las diarias. Si se quiere recuperar a un
  minuto concreto, el **PITR** es un extra de pago (≈ 100 $/mes): sólo cuando
  se venda mucho.
- **Avisos:** activar en *Reports* los avisos de uso de CPU, RAM y disco por
  correo.
- Quitar del `.mcp.json` el MCP de `carto` (cuenta suspendida, ya no se usa).

---

## Fase 3 · Subir a Small

### Qué es el Small

Es el tamaño siguiente de **servidor de base de datos** que Supabase alquila
dentro del mismo proyecto (los llama «Compute add-ons»): una máquina de AWS con
procesador ARM (Graviton), **2 GB de RAM y 2 núcleos compartidos**, en la misma
región (Estocolmo). No es un servidor aparte ni hay que migrar nada: es la
misma base de datos, la misma URL y las mismas claves, en una máquina más
grande. Más RAM = más datos en memoria y más conexiones (90); la CPU sigue
siendo compartida (para núcleos dedicados hay que ir a Large o más).

Cuesta unos **15 $/mes**; el plan Pro trae **10 $ de crédito** de servidor, así
que en la práctica son **unos 5 $ más** que el Pro solo. Se cobra por horas: si
se baja otra vez a Micro, se deja de pagar.

### Cuándo subir (cualquiera de estas)

- En *Reports → Database*, la **CPU por encima del 70 %** o la **RAM por
  encima del 80 %** durante una fiesta.
- Más de **300-400 personas con la app abierta a la vez** (varias fiestas
  llenas la misma noche).
- Errores «Too many database timeouts» en el tiempo real o la app lenta en
  las horas punta (viernes y sábado de 00:00 a 03:00).

### Cómo (lo haces tú)

1. **Hazlo un martes o miércoles por la mañana**: el cambio reinicia la base
   de datos y hay **unos minutos sin servicio** (Supabase dice «menos de 2
   minutos» normalmente).
2. Dashboard → el proyecto Fiestea → **Project Settings → Compute and Disk**.
3. En **Compute size** elige **Small** → **Confirm** (te enseña el precio por
   hora antes de aceptar).
4. Espera a que el proyecto vuelva a «Healthy». Avísame y compruebo que la app
   responde, que el tiempo real conecta y que las tareas programadas (avisos,
   sorteos) siguen corriendo.

Para volver atrás, lo mismo eligiendo **Micro**.

---

## Más allá del Small

El Small es el tercero de una escala larga. Precios aproximados de 2026, a
todos se les descuentan los 10 $ de crédito de Pro:

| Tamaño | RAM | CPU | Conexiones Postgres | ≈ $/mes |
|---|---|---|---|---|
| Nano (gratis) | 0,5 GB | compartida | 60 | 0 |
| Micro | 1 GB | 2 núcleos compartidos | 60 | 10 (gratis con Pro) |
| **Small** | 2 GB | 2 núcleos compartidos | 90 | 15 |
| Medium | 4 GB | 2 núcleos compartidos | 120 | 60 |
| **Large** | 8 GB | **2 núcleos dedicados** | 160 | 110 |
| XL | 16 GB | 4 núcleos dedicados | 240 | 210 |
| 2XL | 32 GB | 8 núcleos dedicados | 380 | 410 |
| 4XL | 64 GB | 16 núcleos dedicados | 480 | 960 |
| 8XL | 128 GB | 32 núcleos dedicados | 490 | 1.870 |
| 12XL / 16XL | 192 / 256 GB | 48 / 64 núcleos | 500 | 2.800 / 3.700 |

Por encima, máquinas a medida hablando con su equipo comercial.

- Hasta **Medium** la CPU es compartida: puede ir a tirones en momentos de
  mucha carga. Desde **Large** los núcleos son dedicados: es el salto que se
  nota con varias salas llenas a la vez.
- Medium no compensa: cuatro veces el Small con la CPU aún compartida.
- El cambio es siempre igual (Compute and Disk, unos minutos de reinicio) y se
  cobra por horas: se puede subir a Large sólo los fines de semana de
  temporada alta y bajar el lunes.

**Orden de saltos:** Pro con Micro al empezar → **Small** cuando lo pidan las
métricas (fase 3) → **Large** cuando haya varias ciudades con fiestas llenas a
la vez. Lo que va más allá de Large, sólo con miles de personas conectadas a la
vez y medido antes con k6.

---

## Fase 4 · Medir después de cada salto

Repetir la prueba de carga (`docs/notas/pruebas.md` explica cómo): crear
300-500 fiester@s de prueba en Fiestea Test Night, recorrido completo, pico
con todos a la vez y chat en tiempo real; después borrarlos. Así sabremos el
límite real del nuevo servidor en vez de estimarlo.

---

## Lo que no hace falta

- **Cambiar de proveedor** o montar servidores propios: con Pro + Small se
  llega de sobra a lo que Fiestea necesita al principio.
- **Pagar Small antes de tiempo**: con los arreglos del 10-11, el Micro del Pro
  aguanta unas 500 personas con la app abierta.
