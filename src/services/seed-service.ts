
import { supabase } from "@/integrations/supabase/client";

// Datos ficticios para pruebas
const MOCK_USERS = [
  { name: "Laura", age: 25, bio: "Amante de la música electrónica y los cócteles creativos", photos: ["https://i.pravatar.cc/300?img=1"] },
  { name: "Carlos", age: 29, bio: "DJ ocasional, siempre buscando la mejor fiesta de la ciudad", photos: ["https://i.pravatar.cc/300?img=11"] },
  { name: "Elena", age: 27, bio: "Bartender profesional. Me encanta bailar toda la noche", photos: ["https://i.pravatar.cc/300?img=5"] },
  { name: "Miguel", age: 31, bio: "Organizador de eventos. Siempre con buena vibra", photos: ["https://i.pravatar.cc/300?img=13"] },
  { name: "Sofía", age: 24, bio: "Amante del house y el techno. Buscando gente con buena energía", photos: ["https://i.pravatar.cc/300?img=9"] },
  { name: "Javier", age: 28, bio: "Aficionado a los festivales. Me gusta conocer gente nueva", photos: ["https://i.pravatar.cc/300?img=15"] },
  { name: "Ana", age: 26, bio: "El ritmo está en mi sangre. ¡Vamos a bailar!", photos: ["https://i.pravatar.cc/300?img=3"] },
  { name: "Pablo", age: 30, bio: "Fotógrafo de eventos. Siempre captando el mejor momento", photos: ["https://i.pravatar.cc/300?img=17"] },
  { name: "Lucía", age: 23, bio: "Estudiante y amante de la buena música", photos: ["https://i.pravatar.cc/300?img=7"] },
  { name: "Daniel", age: 32, bio: "Productor musical. Siempre en busca de nuevos talentos", photos: ["https://i.pravatar.cc/300?img=19"] },
  { name: "Marta", age: 29, bio: "La fiesta no termina hasta que yo me vaya", photos: ["https://i.pravatar.cc/300?img=2"] },
  { name: "Alejandro", age: 27, bio: "Me encanta la música electrónica y las buenas conversaciones", photos: ["https://i.pravatar.cc/300?img=21"] },
  { name: "Carmen", age: 25, bio: "Bailarina profesional. La pista de baile es mi hogar", photos: ["https://i.pravatar.cc/300?img=4"] },
  { name: "Roberto", age: 33, bio: "Empresario y amante de la noche. Buscando nuevas conexiones", photos: ["https://i.pravatar.cc/300?img=23"] },
  { name: "Natalia", age: 26, bio: "La música es mi terapia. Busco buenos momentos", photos: ["https://i.pravatar.cc/300?img=6"] },
  { name: "Hugo", age: 28, bio: "DJ aficionado. Me encanta mezclar y conocer gente", photos: ["https://i.pravatar.cc/300?img=25"] },
  { name: "Patricia", age: 24, bio: "Estudiante de diseño. Busco inspiración en la noche de Mallorca", photos: ["https://i.pravatar.cc/300?img=8"] },
  { name: "Fernando", age: 31, bio: "Barman y aventurero. Conozco los mejores secretos de la isla", photos: ["https://i.pravatar.cc/300?img=27"] },
  { name: "Raquel", age: 27, bio: "Influencer y amante de los eventos. Siempre a la última", photos: ["https://i.pravatar.cc/300?img=10"] },
  { name: "Sergio", age: 29, bio: "Locutor de radio. La música es mi pasión", photos: ["https://i.pravatar.cc/300?img=29"] }
];

const MOCK_VENUES = [
  {
    name: "Pachá Mallorca",
    email: "info@pachamallorca.com",
    type: "discoteca",
    location: { x: 39.5696, y: 2.6502 }
  },
  {
    name: "Festival Mallorca Live",
    email: "contacto@mallorcalive.com",
    type: "festival",
    location: { x: 39.5307, y: 2.7338 }
  },
  {
    name: "BN Club Mallorca",
    email: "reservas@bnclub.com",
    type: "discoteca",
    location: { x: 39.5503, y: 2.6211 }
  },
  {
    name: "Fiesta Privada Villa Sol",
    email: "eventos@villasol.com",
    type: "fiesta_privada",
    location: { x: 39.5892, y: 2.6444 }
  },
  {
    name: "Sunset Beach Party",
    email: "info@sunsetbeachparty.com",
    type: "evento",
    location: { x: 39.4975, y: 2.7520 }
  }
];

// Función para crear usuarios y perfiles de prueba
export const seedProfiles = async () => {
  try {
    // Verificar si ya existen perfiles
    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);

    if (existingProfiles && existingProfiles.length > 0) {
      console.log("Ya existen perfiles en la base de datos. Saltando la creación de datos de prueba.");
      return { success: true, message: "Ya existen datos de prueba" };
    }

    // Crear usuarios ficticios y sus perfiles
    for (const userData of MOCK_USERS) {
      // Crear un usuario en auth
      const email = `${userData.name.toLowerCase()}${Math.floor(Math.random() * 1000)}@test.com`;
      const password = "testuser123";

      const { data: authUser, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: userData.name,
          }
        }
      });

      if (authError) {
        console.error("Error al crear usuario:", authError);
        continue;
      }

      // Crear perfil asociado
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: authUser.user!.id,
          name: userData.name,
          age: userData.age,
          bio: userData.bio,
          photos: userData.photos,
          is_verified: true
        });

      if (profileError) {
        console.error("Error al crear perfil:", profileError);
      }
    }

    // Crear venues ficticias
    for (const venueData of MOCK_VENUES) {
      // Crear un usuario en auth
      const email = `${venueData.email}`;
      const password = "testvenue123";

      const { data: authUser, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: venueData.name,
          }
        }
      });

      if (authError) {
        console.error("Error al crear usuario para venue:", authError);
        continue;
      }

      // Crear venue asociada
      const { error: venueError } = await supabase
        .from('venues')
        .insert({
          venue_id: authUser.user!.id,
          name: venueData.name,
          email: venueData.email,
          type: venueData.type,
          location: `(${venueData.location.x},${venueData.location.y})`,
          is_verified: true,
          event_radius: venueData.type === 'festival' ? 500 : 50
        });

      if (venueError) {
        console.error("Error al crear venue:", venueError);
      }
    }

    return { success: true, message: "Datos de prueba creados correctamente" };
  } catch (error) {
    console.error("Error al crear datos de prueba:", error);
    return { success: false, message: "Error al crear datos de prueba" };
  }
};

// Función para poblar eventos de ejemplo
export const seedEvents = async () => {
  try {
    // Verificar si ya existen eventos
    const { data: existingEvents } = await supabase
      .from('events')
      .select('id')
      .limit(1);

    if (existingEvents && existingEvents.length > 0) {
      console.log("Ya existen eventos en la base de datos. Saltando la creación de eventos de prueba.");
      return { success: true, message: "Ya existen eventos de prueba" };
    }

    // Obtener todas las venues
    const { data: venues, error: venuesError } = await supabase
      .from('venues')
      .select('id, name, location, type');

    if (venuesError || !venues) {
      console.error("Error al obtener venues:", venuesError);
      return { success: false, message: "Error al obtener venues" };
    }

    // Crear eventos para cada venue
    for (const venue of venues) {
      // Crear evento actual (hoy)
      const today = new Date();
      const startDate = new Date(today);
      startDate.setHours(22, 0, 0, 0);
      
      const endDate = new Date(today);
      endDate.setHours(6, 0, 0, 0);
      endDate.setDate(endDate.getDate() + 1);

      const { error: eventError } = await supabase
        .from('events')
        .insert({
          venue_id: venue.id,
          name: `${venue.name} - ${today.toLocaleDateString()}`,
          description: `Evento en ${venue.name}. ¡No te lo pierdas!`,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          location: venue.location,
          qr_code: `VYBE-${venue.id}-${today.toISOString().split('T')[0]}`,
          max_capacity: venue.type === 'festival' ? 5000 : 500
        });

      if (eventError) {
        console.error("Error al crear evento:", eventError);
      }

      // Crear evento futuro (mañana)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const tomorrowStart = new Date(tomorrow);
      tomorrowStart.setHours(22, 0, 0, 0);
      
      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setHours(6, 0, 0, 0);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

      await supabase
        .from('events')
        .insert({
          venue_id: venue.id,
          name: `${venue.name} - ${tomorrow.toLocaleDateString()}`,
          description: `Evento en ${venue.name}. ¡No te lo pierdas!`,
          start_date: tomorrowStart.toISOString(),
          end_date: tomorrowEnd.toISOString(),
          location: venue.location,
          qr_code: `VYBE-${venue.id}-${tomorrow.toISOString().split('T')[0]}`,
          max_capacity: venue.type === 'festival' ? 5000 : 500
        });
    }

    return { success: true, message: "Eventos de prueba creados correctamente" };
  } catch (error) {
    console.error("Error al crear eventos de prueba:", error);
    return { success: false, message: "Error al crear eventos de prueba" };
  }
};
