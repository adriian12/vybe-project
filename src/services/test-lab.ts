import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

export interface TestLabResult {
  eventId: string;
  eventName: string;
  accessCode: string;
  peopleInside: number;
  likesForYou: number;
}

/**
 * La sala de pruebas del seed (`supabase/seeds/mallorca_test_data.sql`).
 *
 * `admin_reset_test_lab()` la lleva a las coordenadas que se le pasan, la deja
 * en marcha con su gente dentro y hace que la mitad le dé like a quien llama,
 * para poder probar el flujo entero con una sola persona. Sólo administración.
 */
export const testLabService = {
  moveHere: async (latitude: number, longitude: number, resetMySwipes: boolean): Promise<TestLabResult> => {
    const { data, error } = await supabase.rpc('admin_reset_test_lab', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_reset_my_swipes: resetMySwipes,
    });

    if (error) {
      if (error.message.includes('TEST_LAB_NOT_FOUND')) {
        throw new ApiError('TEST_LAB_NOT_FOUND', 'admin.testLab.notFound');
      }
      if (error.message.includes('NOT_AUTHORIZED')) {
        throw new ApiError('NOT_AUTHORIZED', 'venue.errors.notAuthorized');
      }
      throw new ApiError('TEST_LAB_FAILED', 'errors.generic');
    }

    const row = data?.[0];
    if (!row) throw new ApiError('TEST_LAB_FAILED', 'errors.generic');

    return {
      eventId: row.event_id,
      eventName: row.event_name,
      accessCode: row.access_code,
      peopleInside: row.people_inside,
      likesForYou: row.likes_for_you,
    };
  },
};
