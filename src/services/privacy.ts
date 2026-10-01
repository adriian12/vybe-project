import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

/**
 * Versiones vigentes de los documentos legales.
 *
 * Al subirlas se vuelve a pedir consentimiento, que es lo que exige el RGPD
 * cuando cambia el tratamiento de los datos.
 */
/**
 * Versión vigente de cada documento.
 *
 * Al subirla, `hasCurrentConsent()` deja de dar por bueno el consentimiento
 * anterior y la pantalla vuelve a pedirlo. Hay que subirla siempre que cambie
 * el fondo del texto: un consentimiento sobre una versión que ya no existe no
 * vale para nada.
 */
export const LEGAL_VERSIONS = {
  terms: '2026-09',
  privacy: '2026-09',
} as const;

export type ConsentDocument = 'terms' | 'privacy' | 'age' | 'marketing';

export interface ConsentRecord {
  document: ConsentDocument;
  version: string;
  acceptedAt: string;
}

export const privacyService = {
  // ==========================================================================
  // CONSENTIMIENTO
  // ==========================================================================

  getMyConsents: async (): Promise<ConsentRecord[]> => {
    const { data, error } = await supabase
      .from('user_consents')
      .select('document, version, accepted_at')
      .eq('accepted', true);

    if (error || !data) return [];

    return data.map((row) => ({
      document: row.document as ConsentDocument,
      version: row.version,
      acceptedAt: row.accepted_at,
    }));
  },

  /** ¿Ha aceptado el usuario las versiones vigentes de términos y privacidad? */
  hasCurrentConsent: async (): Promise<boolean> => {
    const consents = await privacyService.getMyConsents();

    const accepted = (doc: ConsentDocument, version: string) =>
      consents.some((c) => c.document === doc && c.version === version);

    return (
      accepted('terms', LEGAL_VERSIONS.terms) &&
      accepted('privacy', LEGAL_VERSIONS.privacy) &&
      consents.some((c) => c.document === 'age')
    );
  },

  recordConsent: async (marketing: boolean): Promise<void> => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new ApiError('NOT_AUTHENTICATED', 'errors.generic');

    const rows = [
      { document: 'terms', version: LEGAL_VERSIONS.terms, accepted: true },
      { document: 'privacy', version: LEGAL_VERSIONS.privacy, accepted: true },
      { document: 'age', version: '18+', accepted: true },
      { document: 'marketing', version: LEGAL_VERSIONS.privacy, accepted: marketing },
    ].map((row) => ({ ...row, user_id: user.user!.id }));

    const { error } = await supabase
      .from('user_consents')
      .upsert(rows, { onConflict: 'user_id,document,version' });

    if (error) throw new ApiError('CONSENT_FAILED', 'errors.generic');
  },

  // ==========================================================================
  // DERECHO DE ACCESO (art. 20 RGPD)
  // ==========================================================================

  exportMyData: async (): Promise<Blob> => {
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) throw new ApiError('EXPORT_FAILED', 'errors.generic');

    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  },

  downloadMyData: async (): Promise<void> => {
    const blob = await privacyService.exportMyData();
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `vybe-mis-datos-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  },

  // ==========================================================================
  // DERECHO DE SUPRESIÓN (art. 17 RGPD)
  // ==========================================================================

  /**
   * Marca la cuenta para borrado y lanza el borrado duro.
   *
   * La RPC oculta el perfil de inmediato; la Edge Function borra después los
   * ficheros de Storage y el usuario de auth, que requieren service role.
   */
  deleteMyAccount: async (): Promise<void> => {
    const { error } = await supabase.rpc('request_account_deletion');
    if (error) throw new ApiError('DELETE_FAILED', 'errors.generic');

    try {
      await supabase.functions.invoke('delete-account');
    } catch (hardDeleteError) {
      // El borrado queda pendiente y lo completará el proceso programado.
      console.error('Error running hard delete:', hardDeleteError);
    }

    await supabase.auth.signOut();
  },
};
