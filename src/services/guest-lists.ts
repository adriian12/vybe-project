import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

/**
 * Listas de invitados (migración 071).
 *
 * Cada evento tiene la lista de la app (se apunta la gente desde la ficha,
 * si el local la activa) y las listas de sus RRPP, que el local rellena a
 * mano: «Adrián +10». En la puerta se marca cuántos de cada línea entran; si
 * vienen 5 de 11, quedan 6 huecos para más tarde.
 */

export interface GuestListInfo {
  enabled: boolean;
  message: string | null;
  mine: { name: string; companions: number; admitted: number } | null;
}

export interface GuestList {
  id: string;
  name: string;
  kind: 'app' | 'promoter';
  entries: number;
  people: number;
  admitted: number;
}

export interface GuestListSettings {
  enabled: boolean;
  message: string | null;
}

export interface GuestEntry {
  id: string;
  listId: string;
  name: string;
  companions: number;
  admitted: number;
  fromApp: boolean;
  createdAt: string;
}

const ERRORES: Record<string, string> = {
  GUEST_LIST_CLOSED: 'guestList.errors.closed',
  NAME_REQUIRED: 'guestList.errors.name',
  INVALID_COMPANIONS: 'guestList.errors.companions',
  TOO_MANY_LISTS: 'guestList.errors.tooManyLists',
  NOT_AUTHORIZED: 'sales.errors.notAuthorized',
};

const fallo = (message: string): ApiError => {
  const code = Object.keys(ERRORES).find((key) => message.includes(key));
  return new ApiError(code ?? 'GUEST_LIST_FAILED', code ? ERRORES[code] : 'errors.generic');
};

export const guestListService = {
  // ---------------------------------------------------------------- público
  getInfo: async (eventId: string): Promise<GuestListInfo | null> => {
    const { data, error } = await supabase.rpc('get_guest_list_info', { p_event_id: eventId });
    const row = !error && data?.[0];
    if (!row) return null;
    return {
      enabled: Boolean(row.enabled),
      message: row.message,
      mine: row.my_name ? { name: row.my_name, companions: row.my_companions ?? 0, admitted: row.my_admitted ?? 0 } : null,
    };
  },

  join: async (eventId: string, name: string, companions: number): Promise<void> => {
    const { error } = await supabase.rpc('join_guest_list', {
      p_event_id: eventId,
      p_name: name,
      p_companions: companions,
    });
    if (error) throw fallo(error.message);
  },

  leave: async (eventId: string): Promise<void> => {
    const { error } = await supabase.rpc('leave_guest_list', { p_event_id: eventId });
    if (error) throw fallo(error.message);
  },

  // ------------------------------------------------------------------ local
  getLists: async (eventId: string): Promise<{ lists: GuestList[]; settings: GuestListSettings }> => {
    const { data, error } = await supabase.rpc('get_guest_lists', { p_event_id: eventId });
    if (error) throw fallo(error.message);
    const filas = data ?? [];
    return {
      lists: filas.map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind as GuestList['kind'],
        entries: row.entries,
        people: row.people,
        admitted: row.admitted,
      })),
      settings: { enabled: Boolean(filas[0]?.enabled), message: filas[0]?.message ?? null },
    };
  },

  getEntries: async (eventId: string): Promise<GuestEntry[]> => {
    const { data, error } = await supabase.rpc('get_guest_list_entries', { p_event_id: eventId });
    if (error) throw fallo(error.message);
    return (data ?? []).map((row) => ({
      id: row.id,
      listId: row.list_id,
      name: row.name,
      companions: row.companions,
      admitted: row.admitted,
      fromApp: row.from_app,
      createdAt: row.created_at,
    }));
  },

  saveSettings: async (eventId: string, enabled: boolean, message: string): Promise<void> => {
    const { error } = await supabase.rpc('set_guest_list_settings', {
      p_event_id: eventId,
      p_enabled: enabled,
      p_message: message,
    });
    if (error) throw fallo(error.message);
  },

  createList: async (eventId: string, name: string): Promise<string> => {
    const { data, error } = await supabase.rpc('create_guest_list', { p_event_id: eventId, p_name: name });
    if (error) throw fallo(error.message);
    return String(data);
  },

  deleteList: async (listId: string): Promise<void> => {
    const { error } = await supabase.rpc('delete_guest_list', { p_list_id: listId });
    if (error) throw fallo(error.message);
  },

  saveEntry: async (listId: string, entryId: string | null, name: string, companions: number): Promise<void> => {
    const { error } = await supabase.rpc('save_guest_entry', {
      p_list_id: listId,
      p_entry_id: entryId,
      p_name: name,
      p_companions: companions,
    } as never);
    if (error) throw fallo(error.message);
  },

  deleteEntry: async (entryId: string): Promise<void> => {
    const { error } = await supabase.rpc('delete_guest_entry', { p_entry_id: entryId });
    if (error) throw fallo(error.message);
  },

  /** Entran `count` personas de esa línea (negativo para corregir). */
  admit: async (entryId: string, count: number): Promise<{ admitted: number; total: number }> => {
    const { data, error } = await supabase.rpc('admit_guests', { p_entry_id: entryId, p_count: count });
    if (error) throw fallo(error.message);
    const row = data?.[0];
    return { admitted: row?.admitted ?? 0, total: row?.total ?? 0 };
  },
};
