# Usuarios de prueba

> ⚠️ **Sólo para desarrollo.** Las contraseñas de este documento son públicas.
> No ejecutes estos scripts contra un entorno real y no reutilices estas
> credenciales en producción.

## Opción 1 — Script SQL (recomendado)

En el **SQL Editor** de Supabase, en este orden:

1. `supabase/migrations/006_security_and_event_flow.sql` — instala el trigger que
   crea perfiles y locales automáticamente.
2. `supabase/migrations/005_create_test_users.sql` — crea las cuentas en
   `auth.users` con sus metadatos y sus filas en `auth.identities`.
3. `supabase/migrations/004_seed_data.sql` — completa perfiles, locales, eventos
   y dos códigos de acceso.

El orden importa: sin la 006 el trigger no existe y las cuentas de local se
darían de alta como usuarios normales.

## Opción 2 — Manualmente desde el dashboard

En **Authentication > Users > Add User**, marcando siempre **Auto Confirm User**.

El trigger decide si crea un perfil o un local según los metadatos, así que hay
que rellenar el campo *User Metadata* (JSON):

**Usuarios**

```json
{ "account_type": "user", "name": "María García", "age": 25 }
```

**Locales**

```json
{ "account_type": "venue", "venue_name": "Discoteca Pacha", "venue_type": "discoteca" }
```

Si creas un local sin `account_type`, se dará de alta como usuario normal y no
podrá acceder al panel de local.

## Cuentas que crea el seed

| Email | Tipo | Notas |
|-------|------|-------|
| `usuario1@test.com` … `usuario4@test.com` | Usuario | Verificados, con foto y ubicación en Palma |
| `admin@vybe.com` | Administración | `profiles.role = 'admin'` |
| `discoteca@test.com` | Local | Discoteca Pacha, radio 100 m, aprobado |
| `bar@test.com` | Local | Bar La Terraza, radio 50 m, aprobado |
| `festival@test.com` | Local | Festival Mallorca, radio 500 m, aprobado |

Contraseña para todas: la que define `v_password` en
`005_create_test_users.sql`. **Cámbiala antes de ejecutarlo si el proyecto es
accesible desde fuera de tu máquina.**

## Códigos de acceso del seed

| Código | Evento | Local |
|--------|--------|-------|
| `100001` | Noche Techno | Discoteca Pacha |
| `100002` | Afterwork Cocktails | Bar La Terraza |

Ambos eventos empiezan una hora antes de ejecutar el seed, así que están en
curso desde el primer momento.

## Probar el flujo completo

1. Entra como `usuario1@test.com`.
2. En **Eventos** verás «Noche Techno». Ábrelo.
3. Verifica ubicación. La geocerca es real: si no estás cerca de las coordenadas
   del local (Palma), te lo dirá.
   Para probar desde otro sitio, actualiza las coordenadas del local:

   ```sql
   UPDATE public.venues
   SET latitude = <tu_lat>, longitude = <tu_lng>
   WHERE email = 'discoteca@test.com';
   ```

   O aumenta el radio temporalmente:

   ```sql
   UPDATE public.venues SET event_radius = 100000 WHERE email = 'discoteca@test.com';
   ```

4. Escanea el QR o escribe `100001`.
5. Haz las 3 fotos con la cámara (se suben a Storage y verifican tu perfil).
6. Desliza. Para ver a alguien, otro usuario tiene que haber hecho check-in en
   el mismo evento.

## Promover una cuenta a administración

```sql
UPDATE public.profiles SET role = 'admin'
WHERE email = 'tu-email@ejemplo.com';
```

El panel `/admin/dashboard` se abre por rol, no por email.

---

# Datos de prueba de Mallorca

Un segundo juego de datos, más grande y más realista que el de la 004/005:
**50 personas**, **19 locales reales de Mallorca** y una **sala de pruebas** que
se puede llevar a cualquier ubicación para probar desde casa.

Las fiestas son inventadas aunque verosímiles: los locales existen, pero la
programación, los precios y los carteles no son la agenda real de cada sitio, y
las coordenadas son aproximadas.

## Cargar y borrar

```bash
python scripts/generate-seed.py                                      # regenera el SQL
node scripts/run-sql.mjs supabase/seeds/mallorca_test_data.sql       # lo carga
node scripts/run-sql.mjs supabase/seeds/mallorca_test_data_cleanup.sql  # lo borra todo
```

`run-sql.mjs` usa `SUPABASE_ACCESS_TOKEN` y `VITE_SUPABASE_URL` de `.env`, nunca
la sesión del CLI. El seed se puede volver a ejecutar: no duplica nada y deja la
sala de pruebas donde estuviera. La función `admin_reset_test_lab()` es de la
migración `035_test_lab.sql` (con el dominio actualizado en la `036`).

Si los datos se cargaron cuando la marca era «Vybes» (cuentas
`@seed.vybes.test`), `supabase/seeds/rename_seed_to_vybe.sql` los renombra sin
perder nada.

Todo cuelga de cuentas `@seed.vybe.test`. El borrado elimina esas cuentas y en
cascada caen sus perfiles, locales, fiestas, códigos, asistencias, likes,
matches y mensajes.

## Cuentas

Contraseña para todas: la de `SEED_PASSWORD` en `.env`. No está escrita aquí a
propósito: estas cuentas viven en el proyecto de verdad y el repositorio se sube
a GitHub. El SQL generado (`supabase/seeds/mallorca_test_data.sql`) la lleva
dentro, por eso está en `.gitignore`. El email es
`nombre.apellido@seed.vybe.test`, sin acentos (`aina.vidal@seed.vybe.test`).
Todas están verificadas, con 3 fotos, intereses, idiomas y un plan para esta
noche. 28 mujeres y 22 hombres de 18 a 44 años, con preferencias mezcladas.

| Nombre | Sexo | Edad | Usuario | Dentro de |
|--------|------|------|---------|-----------|
| Nerea Garau | Mujer | 18 | `nerea.garau` | BCM Foam Party |
| Paula Ferrer | Mujer | 19 | `paula.ferrer` | BCM Foam Party |
| Maria Sastre | Mujer | 20 | `maria.sastre` | Tokio Joe's Student Night |
| Noa Pons | Mujer | 21 | `noa.pons` | Vybe Test Night |
| Mia Schneider | Mujer | 22 | `mia.schneider` | Bierkönig Live Session |
| Sara Moyà | Mujer | 22 | `sara.moya` | Vybe Test Night |
| Hannah Müller | Mujer | 23 | `hannah.muller` | Bierkönig Live Session |
| Aina Vidal | Mujer | 23 | `aina.vidal` | Vybe Test Night |
| Emma Johansson | Mujer | 24 | `emma.johansson` | Vybe Test Night |
| Clara Riera | Mujer | 24 | `clara.riera` | Physical Tuesday Madness |
| Julia Roig | Mujer | 25 | `julia.roig` | Vybe Test Night |
| Daniela Ruiz | Mujer | 25 | `daniela.ruiz` | Vybe Test Night |
| Laia Fornés | Mujer | 26 | `laia.fornes` | Vybe Test Night |
| Alba Crespí | Mujer | 26 | `alba.crespi` | Vybe Test Night |
| Lena Fischer | Mujer | 26 | `lena.fischer` | Vybe Test Night |
| Carla Serra | Mujer | 27 | `carla.serra` | Vybe Test Night |
| Olivia Brown | Mujer | 27 | `olivia.brown` | Vybe Test Night |
| Zoe Williams | Mujer | 28 | `zoe.williams` | Vybe Test Night |
| Laura Mas | Mujer | 28 | `laura.mas` | Vybe Test Night |
| Valentina Rossi | Mujer | 29 | `valentina.rossi` | Vybe Test Night |
| Camila Torres | Mujer | 29 | `camila.torres` | Tito's Tuesday · Urban & Reggaeton |
| Chloé Martin | Mujer | 30 | `chloe.martin` | Vybe Test Night |
| Sofía Castro | Mujer | 31 | `sofia.castro` | Vybe Test Night |
| Marta Oliver | Mujer | 32 | `marta.oliver` | Tito's Tuesday · Urban & Reggaeton |
| Inés Morey | Mujer | 33 | `ines.morey` | Vybe Test Night |
| Irene Bauzà | Mujer | 34 | `irene.bauza` | Vybe Test Night |
| Elena Bonet | Mujer | 37 | `elena.bonet` | Vybe Test Night |
| Andrea Alemany | Mujer | 41 | `andrea.alemany` | Vybe Test Night |
| Iván Torrens | Hombre | 21 | `ivan.torrens` | BCM Foam Party |
| Marc Coll | Hombre | 22 | `marc.coll` | Tokio Joe's Student Night |
| Hugo Llompart | Hombre | 23 | `hugo.llompart` | Vybe Test Night |
| Joan Salvà | Hombre | 24 | `joan.salva` | Vybe Test Night |
| Matteo Conti | Hombre | 24 | `matteo.conti` | Vybe Test Night |
| Álex Martorell | Hombre | 25 | `alex.martorell` | Vybe Test Night |
| Oliver Smith | Hombre | 25 | `oliver.smith` | Vybe Test Night |
| Jonas Weber | Hombre | 26 | `jonas.weber` | Bierkönig Live Session |
| Guillem Pascual | Hombre | 27 | `guillem.pascual` | Vybe Test Night |
| Luca Bianchi | Hombre | 27 | `luca.bianchi` | Tito's Tuesday · Urban & Reggaeton |
| Rubén Oliver | Hombre | 28 | `ruben.oliver` | Vybe Test Night |
| Pau Llull | Hombre | 29 | `pau.llull` | Vybe Test Night |
| Jaume Riutort | Hombre | 29 | `jaume.riutort` | Vybe Test Night |
| Kwame Mensah | Hombre | 30 | `kwame.mensah` | Vybe Test Night |
| Víctor Cerdà | Hombre | 30 | `victor.cerda` | BCM Foam Party |
| Biel Rosselló | Hombre | 31 | `biel.rossello` | Vybe Test Night |
| Nicolás Vega | Hombre | 32 | `nicolas.vega` | Vybe Test Night |
| Tomás Arbona | Hombre | 33 | `tomas.arbona` | Tito's Tuesday · Urban & Reggaeton |
| Toni Amengual | Hombre | 34 | `toni.amengual` | Vybe Test Night |
| Samuel Duarte | Hombre | 35 | `samuel.duarte` | Physical Tuesday Madness |
| David Nicolau | Hombre | 38 | `david.nicolau` | Vybe Test Night |
| Carlos Mendoza | Hombre | 44 | `carlos.mendoza` | Vybe Test Night |

Los locales también tienen cuenta (`titos@seed.vybe.test`,
`bcm@seed.vybe.test`, `tokio@seed.vybe.test`, `megapark@`, `bierkonig@`,
`oberbayern@`, `nikki@`, `purobeach@`, `anima@`, `jazzvoyeur@`, `abaco@`,
`hostalcuba@`, `garito@`, `esgremi@`, `coliseo@`, `mallorcalive@`, `pirates@`,
`bolero@`, `physical@`) con la misma contraseña, y la sala de pruebas es
`sala-pruebas@seed.vybe.test`. Todos están aprobados.

## Fiestas

30 fiestas del 15 de septiembre al 10 de octubre de 2026 en Palma, Calvià,
Platja de Palma y Cala Ratjada. Las de la noche del 15 al 16 tienen gente dentro
y código de acceso:

| Código | Fiesta | Local | Válido hasta |
|--------|--------|-------|--------------|
| `511201` | Tito's Tuesday · Urban & Reggaeton | Tito's Mallorca (Palma) | 16/09 06:00 |
| `511202` | BCM Foam Party | BCM Planet Dance (Calvià) | 16/09 06:00 |
| `511203` | Tokio Joe's Student Night | Tokio Joe's (Calvià) | 16/09 05:00 |
| `511204` | Bierkönig Live Session | Bierkönig (Palma) | 16/09 03:00 |
| `511205` | Physical Tuesday Madness | Physical Cala Ratjada (Capdepera) | 16/09 06:00 |
| `LAB777` | Vybe Test Night | Vybe · Sala de pruebas | Siempre en marcha |

Estas fechas son absolutas, no relativas a `NOW()`: pasada esa noche, los cinco
primeros códigos caducan y las demás fiestas siguen apareciendo como próximas.
Para probar otro día, usa la sala de pruebas.

## Sala de pruebas

Una fiesta que no termina, con **35 personas dentro** (de las 50), pensada para
probar geocerca, código, tablón, likes y matches sin salir de casa.

1. Entra con una cuenta de administración (`profiles.role = 'admin'`; si la tuya
   no lo es, promociónala con el SQL de arriba).
2. Desde el teléfono, en `/admin/dashboard` → **Resumen** → **Sala de pruebas**,
   pulsa **Traer la sala a mi ubicación**. Coge el GPS del dispositivo, mueve
   el local y la fiesta allí, recoloca a las 35 personas a su alrededor, alarga
   la fiesta 7 días y hace que la mitad de las que te encajan te den like, para
   que los matches salgan al primer swipe.
3. Marca **Borrar mis swipes de esa fiesta** si quieres volver a ver a todo el
   mundo después de haberlos pasado.
4. En **Inicio** aparece «Vybe Test Night» a tu lado: entra con `LAB777`.

Sin la app, lo mismo se hace desde el SQL Editor. Ahí no hay sesión, así que
primero hay que decir en nombre de qué cuenta de administración se llama (es
también la que recibe los likes):

```sql
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object(
  'sub', (SELECT id FROM auth.users WHERE email = 'tu-email@ejemplo.com'),
  'role', 'authenticated')::text, true);
SELECT * FROM public.admin_reset_test_lab(39.5754, 2.6545, TRUE);  -- latitud, longitud, borrar mis swipes
COMMIT;
```

El tablón aplica las reglas de siempre: sólo verás a quien busca tu sexo y
viceversa, así que con un perfil de hombre que busca mujeres verás a las
mujeres de la sala que buscan hombres o les da igual.
