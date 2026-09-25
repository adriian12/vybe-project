import { supabase } from '@/integrations/supabase/client';
import { ApiError } from '@/services/api';

/**
 * El perfil del negocio (migración 077): lo que sale en su ficha pública, en
 * la pantalla de compra y en las entradas en PDF (logo y nombre arriba a la
 * izquierda, «powered by Fiestea» a la derecha).
 *
 * El nombre queda fijo una vez aprobado el negocio (`protect_venue_fields`).
 * El logo va al bucket público `venue-logos`, en la carpeta del negocio.
 */

export interface BusinessProfile {
  name: string;
  isVerified: boolean;
  logoUrl: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  contactEmail: string | null;
  website: string | null;
  instagram: string | null;
  businessTerms: string | null;
}

export type BusinessProfileInput = Omit<BusinessProfile, 'isVerified' | 'logoUrl'>;

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export const businessProfileService = {
  get: async (venueId: string): Promise<BusinessProfile | null> => {
    const { data } = await supabase
      .from('venues')
      .select(
        'name, is_verified, logo_url, address, city, latitude, longitude, phone, contact_email, website, instagram, business_terms',
      )
      .eq('id', venueId)
      .maybeSingle();
    if (!data) return null;
    return {
      name: data.name,
      isVerified: Boolean(data.is_verified),
      logoUrl: data.logo_url,
      address: data.address,
      city: data.city,
      latitude: data.latitude,
      longitude: data.longitude,
      phone: data.phone,
      contactEmail: data.contact_email,
      website: data.website,
      instagram: data.instagram,
      businessTerms: data.business_terms,
    };
  },

  save: async (venueId: string, input: BusinessProfileInput): Promise<void> => {
    const { error } = await supabase
      .from('venues')
      .update({
        name: input.name,
        address: input.address,
        city: input.city,
        latitude: input.latitude,
        longitude: input.longitude,
        phone: input.phone,
        contact_email: input.contactEmail,
        website: input.website,
        instagram: input.instagram,
        business_terms: input.businessTerms,
      })
      .eq('id', venueId);
    if (error) throw new ApiError('SAVE_FAILED', 'errors.generic');
  },

  /** Sube el logo (PNG, JPG o WebP de hasta 2 MB) y lo deja puesto. */
  uploadLogo: async (venueId: string, file: File): Promise<string> => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      throw new ApiError('BAD_FILE', 'venue.business.errors.logoType');
    }
    if (file.size > LOGO_MAX_BYTES) throw new ApiError('BAD_FILE', 'venue.business.errors.logoSize');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    // Nombre nuevo cada vez: así ninguna caché enseña el logo anterior.
    const path = `${venueId}/logo-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from('venue-logos').upload(path, file, {
      contentType: file.type,
      cacheControl: '31536000',
    });
    if (error) throw new ApiError('UPLOAD_FAILED', 'venue.business.errors.logoUpload');
    const url = supabase.storage.from('venue-logos').getPublicUrl(path).data.publicUrl;
    const { error: errorGuardar } = await supabase.from('venues').update({ logo_url: url }).eq('id', venueId);
    if (errorGuardar) throw new ApiError('SAVE_FAILED', 'errors.generic');
    return url;
  },

  removeLogo: async (venueId: string): Promise<void> => {
    const { error } = await supabase.from('venues').update({ logo_url: null }).eq('id', venueId);
    if (error) throw new ApiError('SAVE_FAILED', 'errors.generic');
  },
};
