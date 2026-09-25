/**
 * Interruptores de funciones que están hechas pero apagadas.
 *
 * `PHONE_SIGNUP`: entrar y registrarse con el móvil y un código por SMS
 * (`phone-auth-form.tsx`). Está apagado para no pagar SMS al empezar: el alta
 * va con correo, Google o Apple. Para encenderlo:
 *   1. En Supabase → Authentication → Providers → Phone, activarlo con Twilio
 *      Verify (Account SID, Auth Token y el Service SID de Verify, que se crea
 *      en console.twilio.com → Verify → Services, con SMS y WhatsApp).
 *   2. Poner `VITE_PHONE_SIGNUP=true` en el entorno de compilación (Vercel y
 *      Codemagic) o cambiar aquí el valor por defecto.
 */
export const PHONE_SIGNUP = (import.meta.env.VITE_PHONE_SIGNUP as string | undefined) === 'true';
