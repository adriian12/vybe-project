import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';
import { guestListService } from '@/services/guest-lists';

/**
 * Lo que el negocio decide de cada fiesta (migración 081 y lista, 071):
 *
 *   · swipe: si dentro se puede conocer gente (tablón, deslizar, match);
 *   · recuento: el público ve cuánta gente hay dentro, en directo;
 *   · % de hombres y mujeres, en directo;
 *   · Lista Fiestea: la gente se apunta desde la ficha con su nombre y
 *     acompañantes.
 *
 * La base de datos es la que los hace cumplir; aquí sólo se leen y se guardan.
 */

export interface EventLiveSettings {
  swipe: boolean;
  headcount: boolean;
  genderSplit: boolean;
  guestList: boolean;
  guestListMessage: string | null;
}

export const eventSettingsService = {
  get: async (eventId: string): Promise<EventLiveSettings | null> => {
    const { data } = await supabase
      .from('events')
      .select('swipe_enabled, show_headcount, show_gender_split, guest_list_enabled, guest_list_message')
      .eq('id', eventId)
      .maybeSingle();
    if (!data) return null;
    return {
      swipe: data.swipe_enabled ?? true,
      headcount: data.show_headcount ?? false,
      genderSplit: data.show_gender_split ?? false,
      guestList: data.guest_list_enabled ?? false,
      guestListMessage: data.guest_list_message ?? null,
    };
  },

  save: async (eventId: string, settings: EventLiveSettings): Promise<void> => {
    const { error } = await supabase.rpc('set_event_live_settings', {
      p_event_id: eventId,
      p_swipe: settings.swipe,
      p_headcount: settings.headcount,
      p_gender: settings.genderSplit,
    });
    if (error) {
      throw new ApiError(
        error.message.includes('NOT_AUTHORIZED') ? 'NOT_AUTHORIZED' : 'SAVE_FAILED',
        error.message.includes('NOT_AUTHORIZED') ? 'sales.errors.notAuthorized' : 'errors.generic',
      );
    }
    await guestListService.saveSettings(eventId, settings.guestList, settings.guestListMessage ?? '');
  },
};
