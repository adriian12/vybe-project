
import { serve } from "https://deno.land/std@0.193.0/http/server.ts";

// Simulación de envío de SMS
interface SMSData {
  phoneNumber: string;
  code: string;
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
    const { phoneNumber, code } = await req.json() as SMSData;

    if (!phoneNumber || !code) {
      return new Response(
        JSON.stringify({ error: "Se requiere número de teléfono y código" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validación básica de número de teléfono
    const phoneRegex = /^\+?[0-9]{9,15}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return new Response(
        JSON.stringify({ error: "Número de teléfono no válido" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Simular el envío de SMS (en producción usaríamos un servicio como Twilio)
    console.log(`Enviando SMS a ${phoneNumber} con código ${code}`);

    // En una implementación real, aquí se haría la llamada a la API de un servicio de SMS
    // Por ejemplo, Twilio, MessageBird, etc.

    // Simular éxito después de 1 segundo
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Devolver respuesta exitosa
    return new Response(
      JSON.stringify({ success: true, message: "SMS enviado correctamente" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending SMS:", error);
    
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
