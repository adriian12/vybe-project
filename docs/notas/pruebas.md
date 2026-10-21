# Cuentas y salas de pruebas

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- El puerto de Vite es 5173 y debe coincidir con las Redirect URLs de Supabase.
- **Pruebas con dos cuentas** (`carlos@vybe-test.local`, hombre, y
  `elena@vybe-test.local`, mujer): las dos entran en «Aurora Sessions» (Sala
  Aurora, código `394410`), con las 50 personas del seed dentro con su foto y
  likes ya dados a ambas. Se ven entre sí. Los clubbers de verdad desaparecen
  del tablón de los demás a las 12 h sin abrir la app (`last_seen_at`).
- **Capturas del App Store** (20-10-2026, `D:WebsVybe Appcapturas-app-store`):
  se hacen en local con la cuenta del seed `alex.martorell@seed.vybe.test`
  (contraseña `SEED_PASSWORD`), que está dentro de «Fiestea Test Night». Tiene
  un match de prueba con `julia.roig@seed.vybe.test` y cinco mensajes, creados
  para la captura del chat: no borrarlos. Las fotos del seed son de pravatar.cc.
- **Cuenta de revisión de Apple** (20-10-2026): `revision.apple@fiestea.es`,
  «Apple Review», con contraseña propia que no está en ningún fichero (si se
  pierde, se cambia en Supabase › Authentication y se actualiza en App Store
  Connect). Foto de perfil de Unsplash en `event-photos`. No borrarla mientras
  haya versiones en revisión. Durante una revisión, Aurora no puede tener la
  entrada cerrada (`entry_closed_at`): el revisor entra con 394410.
- **Salas de pruebas:** «Aurora Sessions» (código `394410`, Sala Aurora) y
  «Fiestea Test Night» (código `LAB777`, Fiestea · Sala de pruebas). Las dos tienen
  `requires_location = FALSE` y `test_lab = TRUE`.
- **Aurora Sessions es la sala de pruebas permanente** (migración 044). Tiene
  `events.requires_location = FALSE`, así que se entra con el código desde
  cualquier sitio, sin pedir el GPS (`EventAccessPage`), y el tablón no filtra
  por distancia. También tiene `events.test_lab = TRUE`:
  - las 50 personas del seed salen a **cualquier** cuenta, también a una recién
    creada;
  - no caducan por `last_seen_at`;
  - aceptan cualquier género (sólo cuenta lo que busca quien mira);
  - al entrar, la mitad da like a quien llega (`test_lab_welcome_likes`), para
    poder probar el match.

  Desde la migración 112, `keep_test_lab_open()` deja `requires_location` en
  FALSE en cualquier sala con `test_lab`, también al guardarla desde
  administración (`admin_update_event()` la recalculaba con las coordenadas).

  El evento dura hasta 2030. **Se queda así hasta que el usuario pida
  borrarlos.** En los demás eventos el tablón y el canje siguen filtrando por
  distancia con el radio del local.
