import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';
import { guestListService } from '@/services/guest-lists';

/**
 * Lo que el negocio decide de cada fiesta (migración 081 y lista, 071):
 *
 *   · entrada: si se puede entrar con QR, código o ubicación (111). Apagada,
 *     la ficha sólo ofrece «Voy a ir» y el swipe se apaga con ella;
 *   · cómo se entra (150): con el QR o el código del negocio, o sólo estando
 *     en el sitio y pulsando «Entrar» (hace falta la ubicación de la fiesta);
 *   · swipe: si dentro se puede conocer gente (tablón, deslizar, match);
 *   · recuento: el público ve cuánta gente hay dentro, en directo;
 *   · % de hombres y mujeres, en directo;
 *   · Lista Fiestea: la gente se apunta desde la ficha con su nombre y
 *     acompañantes.
 *
 * La base de datos es la que los hace cumplir; aquí sólo se leen y se guardan.
 */

export type EntryMethod = 'code' | 'location';

export interface EventLiveSettings {
  entry: boolean;
  entryMethod: EntryMethod;
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
      .select('entry_enabled, entry_method, swipe_enabled, show_headcount, show_gender_split, guest_list_enabled, guest_list_message')
      .eq('id', eventId)
      .maybeSingle();
    if (!data) return null;
    return {
      entry: data.entry_enabled ?? true,
      entryMethod: data.entry_method === 'location' ? 'location' : 'code',
      swipe: (data.entry_enabled ?? true) && (data.swipe_enabled ?? true),
      headcount: data.show_headcount ?? false,
      genderSplit: data.show_gender_split ?? false,
      guestList: data.guest_list_enabled ?? false,
      guestListMessage: data.guest_list_message ?? null,
    };
  },

  save: async (eventId: string, settings: EventLiveSettings): Promise<void> => {
    const { error } = await supabase.rpc('set_event_live_settings', {
      p_event_id: eventId,
      p_entry: settings.entry,
      p_entry_method: settings.entryMethod,
      p_swipe: settings.entry && settings.swipe,
      p_headcount: settings.headcount,
      p_gender: settings.genderSplit,
    });
    if (error) {
      if (error.message.includes('EVENT_WITHOUT_LOCATION')) {
        throw new ApiError('EVENT_WITHOUT_LOCATION', 'venue.liveSettings.entryMethod.needsLocation');
      }
      throw new ApiError(
        error.message.includes('NOT_AUTHORIZED') ? 'NOT_AUTHORIZED' : 'SAVE_FAILED',
        error.message.includes('NOT_AUTHORIZED') ? 'sales.errors.notAuthorized' : 'errors.generic',
      );
    }
    await guestListService.saveSettings(eventId, settings.guestList, settings.guestListMessage ?? '');
  },
};

/** Los de una fiesta nueva, como los pone la base de datos. */
export const DEFAULT_LIVE_SETTINGS: EventLiveSettings = {
  entry: true,
  entryMethod: 'code',
  swipe: true,
  headcount: false,
  genderSplit: false,
  guestList: false,
  guestListMessage: null,
};

/** Si `a` cambia algo de lo que la base de datos pone por defecto. */
export const differsFromDefault = (a: EventLiveSettings): boolean =>
  (Object.keys(DEFAULT_LIVE_SETTINGS) as (keyof EventLiveSettings)[]).some(
    (k) => (a[k] ?? null) !== (DEFAULT_LIVE_SETTINGS[k] ?? null),
  );
