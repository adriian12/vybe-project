import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

export interface TrustedContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface SosAlert {
  id: string;
  profileId: string;
  profileName?: string;
  eventId?: string;
  eventName?: string;
  latitude?: number;
  longitude?: number;
  note?: string;
  status: 'active' | 'resolved' | 'cancelled';
  createdAt: string;
  /** Cuándo el personal de la fiesta pulsó «Voy para allá». */
  handledAt?: string;
}

export interface PendingPhoto {
  id: string;
  profileId: string;
  profileName?: string;
  url: string;
  /** `photo`, `event_photo` o `face_verification`. */
  kind?: string;
  score?: number;
  createdAt: string;
  /** Nombre del evento en el que está esa persona ahora mismo, si lo hay. */
  eventName?: string;
  /** Está esperando dentro de un evento en marcha: revisar esto primero. */
  urgent?: boolean;
}

export const safetyService = {
  // ==========================================================================
  // CONTACTOS DE CONFIANZA
  // ==========================================================================

  getContacts: async (): Promise<TrustedContact[]> => {
    const { data, error } = await supabase
      .from('trusted_contacts')
      .select('id, name, phone, email')
      .order('created_at');

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone ?? undefined,
      email: row.email ?? undefined,
    }));
  },

  addContact: async (contact: { name: string; phone?: string; email?: string }): Promise<void> => {
    if (!contact.phone && !contact.email) {
      throw new ApiError('NEEDS_CHANNEL', 'safety.contactNeedsChannel');
    }

    const { data: profileId } = await supabase.rpc('current_profile_id');
    if (!profileId) throw new ApiError('PROFILE_NOT_FOUND', 'errors.generic');

    const { error } = await supabase.from('trusted_contacts').insert({
      profile_id: profileId as string,
      name: contact.name,
      phone: contact.phone || null,
      email: contact.email || null,
    });

    if (error) throw new ApiError('SAVE_FAILED', 'errors.generic');
  },

  removeContact: async (contactId: string): Promise<void> => {
    const { error } = await supabase.from('trusted_contacts').delete().eq('id', contactId);
    if (error) throw new ApiError('DELETE_FAILED', 'errors.generic');
  },

  // ==========================================================================
  // BOTÓN DE EMERGENCIA
  //
  // En una app que junta desconocidos de noche esto no es accesorio.
  // ==========================================================================

  triggerSos: async (params: {
    eventId?: string;
    latitude?: number;
    longitude?: number;
    note?: string;
  }): Promise<string> => {
    const { data: profileId } = await supabase.rpc('current_profile_id');
    if (!profileId) throw new ApiError('PROFILE_NOT_FOUND', 'errors.generic');

    const { data, error } = await supabase
      .from('sos_alerts')
      .insert({
        profile_id: profileId as string,
        event_id: params.eventId ?? null,
        latitude: params.latitude ?? null,
        longitude: params.longitude ?? null,
        note: params.note ?? null,
      })
      .select('id')
      .single();

    if (error || !data) throw new ApiError('SOS_FAILED', 'errors.generic');

    // El aviso a los contactos lo envía la Edge Function, que tiene las
    // credenciales de SMS y correo. Si falla, la alerta ya está registrada.
    try {
      await supabase.functions.invoke('send-sos-alert', { body: { alertId: data.id } });
    } catch (notifyError) {
      console.error('Error notifying trusted contacts:', notifyError);
    }

    return data.id;
  },

  getActiveAlert: async (): Promise<SosAlert | null> => {
    const { data } = await supabase
      .from('sos_alerts')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    return {
      id: data.id,
      profileId: data.profile_id,
      eventId: data.event_id ?? undefined,
      latitude: data.latitude ?? undefined,
      longitude: data.longitude ?? undefined,
      note: data.note ?? undefined,
      status: data.status as SosAlert['status'],
      createdAt: data.created_at,
      handledAt: data.handled_at ?? undefined,
    };
  },

  cancelSos: async (alertId: string): Promise<void> => {
    const { error } = await supabase
      .from('sos_alerts')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
      .eq('id', alertId);

    if (error) throw new ApiError('CANCEL_FAILED', 'errors.generic');
  },

  // ==========================================================================
  // MODERACIÓN (administración)
  // ==========================================================================

  getActiveAlerts: async (): Promise<SosAlert[]> => {
    const { data, error } = await supabase
      .from('sos_alerts')
      .select('*, profiles!inner(name), events(name)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return data.map((row) => {
      const record = row as typeof row & {
        profiles: { name: string } | null;
        events: { name: string } | null;
      };
      return {
        id: record.id,
        profileId: record.profile_id,
        profileName: record.profiles?.name,
        eventId: record.event_id ?? undefined,
        eventName: record.events?.name,
        latitude: record.latitude ?? undefined,
        longitude: record.longitude ?? undefined,
        note: record.note ?? undefined,
        status: 'active',
        createdAt: record.created_at,
      };
    });
  },

  /**
   * Por RPC y no con un UPDATE directo: administración sólo puede leer
   * `sos_alerts`, y la RLS dejaba el UPDATE en cero filas sin dar error, así que
   * la alerta volvía a salir al recargar (migración 066).
   */
  resolveAlert: async (alertId: string): Promise<void> => {
    const { error } = await supabase.rpc('resolve_sos_alert', { p_alert_id: alertId });
    if (error) throw new ApiError('RESOLVE_FAILED', 'errors.generic');
  },

  /**
   * La cola de moderación, ordenada por urgencia y no por orden de llegada.
   *
   * El orden lo decide `get_pending_moderation()`: primero quien está dentro de
   * un evento en marcha esperando para entrar al tablón. Una foto de perfil de
   * ayer puede esperar; alguien de pie en la puerta de una discoteca, no.
   */
  getPendingPhotos: async (): Promise<PendingPhoto[]> => {
    const { data, error } = await supabase.rpc('get_pending_moderation', { p_limit: 100 });

    if (error || !data) {
      if (error) console.error('Error loading moderation queue:', error);
      return [];
    }

    return data.map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      profileName: row.profile_name ?? undefined,
      url: row.url,
      kind: row.kind ?? undefined,
      score: row.score ?? undefined,
      createdAt: row.created_at,
      eventName: row.event_name ?? undefined,
      urgent: row.urgent ?? false,
    }));
  },

  reviewPhoto: async (itemId: string, approve: boolean, reason?: string): Promise<void> => {
    const { error } = await supabase.rpc('review_photo', {
      p_item_id: itemId,
      p_approve: approve,
      p_reason: reason ?? null,
    });

    if (error) throw new ApiError('REVIEW_FAILED', 'errors.generic');
  },

  suspendProfile: async (profileId: string, days?: number, reason?: string): Promise<void> => {
    const { error } = await supabase.rpc('suspend_profile', {
      p_profile_id: profileId,
      p_days: days ?? null,
      p_reason: reason ?? null,
    });

    if (error) throw new ApiError('SUSPEND_FAILED', 'errors.generic');
  },

  reinstateProfile: async (profileId: string): Promise<void> => {
    const { error } = await supabase.rpc('reinstate_profile', { p_profile_id: profileId });
    if (error) throw new ApiError('REINSTATE_FAILED', 'errors.generic');
  },
};
