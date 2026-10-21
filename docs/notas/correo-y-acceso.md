# Correo, registro e inicio de sesión

Notas de trabajo de Fiestea (antes en `CLAUDE.md`). Se leen cuando la tarea toca este tema.

- **Correos de `auth-email`:**
  - **Recuperar la contraseña** usa el tipo `recovery` de `generateLink()`.
    Con `recover`, como estaba antes, Supabase contestaba «Invalid email action
    link type» y el correo **nunca** salía.
  - **Registrarse con un correo que ya tiene cuenta** no dice nada en pantalla
    (no se revela quién está registrado), pero a ese correo le llega «Ya tienes
    una cuenta» con un enlace para elegir contraseña nueva.
  - **Recuperar la contraseña de un correo que no existe** responde igual que
    si existiera.
  - **Idiomas:** los correos están en es/en/de/ca.
  - **Correo o móvil ya registrados** (migración 051): el formulario de alta lo
    marca en rojo al salir del campo, con la acción `check` de `auth-email`
    (60 por hora e IP) y `signup_availability()`, que sólo puede llamar
    `service_role`. El alta devuelve `EMAIL_TAKEN` o `PHONE_TAKEN` (409). Fue
    decisión del usuario decirlo claro, aunque permita saber si un correo tiene
    cuenta.
  - **«Eliminar cuenta»** está en el perfil, debajo de «Cerrar sesión», y hay
    que escribir ELIMINAR para confirmar. `delete-account` borra mensajes,
    conexiones, analítica, ficheros y el usuario de auth; el resto cae en
    cascada. Las columnas de auditoría hacia `auth.users` pasan a `SET NULL`
    (migración 052) para que el borrado no se atasque.
  - **Pruebas:** usa `delivered+algo@resend.dev`, que Resend acepta sin
    entregar a nadie, y borra luego la cuenta.
- **El correo NO sale por Supabase.** El servicio de correo integrado sólo
  entrega a los miembros de tu organización de Supabase y admite dos o tres
  mensajes por hora, así que quien se registraba desde fuera nunca recibía el
  correo de verificación. El alta, el reenvío y la recuperación de contraseña
  van por la Edge Function `auth-email`, que usa `generateLink()` para obtener
  el enlace sin mandarlo y lo envía por Resend. **No uses `supabase.auth.signUp()`
  ni `auth.resend()` desde el cliente**: volverían al servicio que no entrega.
  Para escribir a cualquier persona hace falta un dominio verificado en Resend;
  con `onboarding@resend.dev` sólo llega al dueño de la cuenta de Resend.
- **«Continuar con Google»** (sólo en la app instalada, `social-auth.ts`).
  - **Clientes OAuth:** están en el proyecto de Google Cloud `563350138901`:
    uno web, uno de iOS (`es.fiestea.ios`: hay que cambiarle el bundle ID en
    Google Cloud, que tenía `es.fiestea.app`) y **tres de Android** con el
    paquete `es.fiestea.app`, uno por huella SHA-1: depuración (`40:5D:6A:…`,
    el APK local), firma de Google Play (`6C:5D:26:…`, lo que se instala desde
    la tienda) y subida (`D7:D2:E5:…`). Sin la de Google Play, en la versión de
    la tienda eliges la cuenta y vuelve a pedirla en bucle (pasó el 21-10-2026).
    Si Play cambia la clave de firma, hay que añadir la nueva huella.
  - **Supabase:** el proveedor Google tiene como `client_id` «web,iOS»,
    porque los tokens de Android llevan como audiencia el ID web. El secreto
    del cliente web está sólo en Supabase, y `skip_nonce_check` está activo.
  - **La app:** lee `VITE_GOOGLE_WEB_CLIENT_ID` y `VITE_GOOGLE_IOS_CLIENT_ID`
    del `.env` local (para el APK) y de `codemagic.yaml` (para el IPA).
    Codemagic añade al `Info.plist` el esquema inverso del cliente de iOS.
  - **Android:** `MainActivity` tiene que implementar
    `ModifiedMainActivityForSocialLoginPlugin`; si no, el plugin no abre el
    inicio de sesión.
  - **Al firmar para Play:** hay que añadir en Google Cloud otro cliente
    Android con la SHA-1 de *Play App Signing*.
- **La sesión sólo se cierra con «Cerrar sesión».** Dentro de la app se guarda
  en las preferencias nativas (`@capacitor/preferences`,
  `src/integrations/supabase/auth-storage.ts`), no en el `localStorage` de la
  WebView, que el sistema puede vaciar. La bienvenida y `/auth` van envueltas en
  `RedirectIfLoggedIn`: si ya había sesión, llevan a la pantalla de la cuenta.
  Antes la app abría siempre en «Continuar como usuario» y parecía que se había
  cerrado la sesión.
- **Correo entrante de `vybes.es`.** El MX apunta a Resend (recepción).
  `resend-webhook` reenvía `email.received` a `INBOUND_FORWARD_TO` con
  `Reply-To` al remitente; leer el correo recibido exige `RESEND_FULL_API_KEY`
  (la `RESEND_API_KEY` es sólo de envío). DMARC ya existe en el DNS (Piensa
  Solutions): se edita, no se crea otro.
- **Primer acceso con Google o Apple:** `complete-profile-dialog.tsx`
  pregunta antes «¿Cómo quieres entrar?». Invitado entra con el nombre de
  Google; Fiester@ rellena la ficha (`FiesterForm`). Pasar de invitado a
  fiester@ sin ficha pide el mismo formulario (`account-type-card.tsx`); si
  ya fue fiester@, sus datos siguen y se cambian en el perfil.
