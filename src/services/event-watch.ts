import { supabase } from '@/integrations/supabase/client';

/**
 * «Avisarme» (migración 130): aviso push cuando quedan pocas entradas de una
 * fiesta. La tabla aún no está en los tipos generados.
 */
export const eventWatchService = {
  isWatching: async (eventId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('event_watchers' as never)
      .select('event_id')
      .eq('event_id', eventId)
      .maybeSingle();
    return !error && Boolean(data);
  },

  /** Pone o quita el aviso; devuelve cómo queda. */
  toggle: async (eventId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc('toggle_event_watch' as never, { p_event_id: eventId } as never);
    if (error) throw error;
    return Boolean(data);
  },
};
