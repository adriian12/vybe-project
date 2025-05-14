
import { serve } from "https://deno.land/std@0.193.0/http/server.ts";

// Simulación de envío de correo electrónico
interface EmailData {
  email: string;
  name: string;
  code: string;
  type: "register" | "confirmation" | "verification";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    // Obtener datos del request
    const { email, name, code, type } = await req.json() as EmailData;

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Se requiere dirección de correo electrónico" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validación básica de correo electrónico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Dirección de correo electrónico no válida" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Preparar el correo según el tipo
    let subject = "";
    let content = "";

    switch (type) {
      case "register":
        subject = "Bienvenido a Vybe - Confirma tu cuenta";
        content = `Hola ${name || "usuario"},\n\nGracias por registrarte en Vybe. Usa el siguiente código para confirmar tu cuenta: ${code}\n\nEste código expirará en 30 minutos.\n\nSaludos,\nEl equipo de Vybe`;
        break;
      case "confirmation":
        subject = "Confirmación de cuenta Vybe";
        content = `Hola ${name || "usuario"},\n\nTu cuenta ha sido confirmada correctamente. ¡Ahora puedes comenzar a usar Vybe!\n\nSaludos,\nEl equipo de Vybe`;
        break;
      case "verification":
        subject = "Código de verificación Vybe";
        content = `Hola ${name || "usuario"},\n\nUsa el siguiente código para verificar tu cuenta: ${code}\n\nEste código expirará en 30 minutos.\n\nSaludos,\nEl equipo de Vybe`;
        break;
      default:
        subject = "Mensaje de Vybe";
        content = `Hola ${name || "usuario"},\n\nGracias por usar Vybe.\n\nSaludos,\nEl equipo de Vybe`;
    }

    // Simular el envío de correo (en producción usaríamos un servicio como SendGrid, Resend, etc.)
    console.log(`Enviando correo a ${email} con asunto "${subject}"`);
    console.log(`Contenido: ${content}`);

    // En una implementación real, aquí se haría la llamada a la API de un servicio de correo
    // Por ejemplo, SendGrid, AWS SES, Resend, etc.

    // Simular éxito después de 1 segundo
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Devolver respuesta exitosa
    return new Response(
      JSON.stringify({ success: true, message: "Correo enviado correctamente" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
