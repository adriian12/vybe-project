-- ============================================================================
-- 094 · C-06, C-07 y A-02: columnas con privilegio y fotos del evento privadas
-- ============================================================================
-- OJO con el mecanismo: en PostgreSQL el privilegio A NIVEL DE TABLA manda
-- sobre el de columna, así que revocar columnas sueltas mientras el rol
-- conserva SELECT sobre la tabla NO hace nada. Hay que revocar la tabla y
-- conceder la lista de columnas permitidas, que es lo que se hace aquí.
--
-- Consecuencia a tener presente: una columna nueva de `profiles` o `venues`
-- NO será legible hasta que se añada a su GRANT. Es el lado seguro del fallo,
-- pero hay que acordarse al añadir columnas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C-06 · La política «Profiles are visible to event peers and matches» da la
-- fila entera, con teléfono, correo, latitud y longitud, a cualquiera que
-- comparta fiesta. Esos cuatro campos dejan de poder leerse desde el
-- navegador; el propio perfil se lee por `get_my_profile()`.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
    account_type, age, avatar, bio, created_at, deletion_requested_at,
    face_verified, gender, id, is_invisible, is_verified, languages, locale,
    name, notify_events, notify_matches, notify_messages, phone_verified,
    photos, plan_tonight, profile_completed_at, role, staff_only, status,
    suspended_until, suspension_reason, updated_at, user_id, wants
) ON public.profiles TO authenticated;

/**
 * El perfil propio, entero. Lo pide `api.getCurrentProfile()`, que antes
 * hacía `select('*')` y ahora no podría leer teléfono, correo ni ubicación.
 */
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.profiles WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ---------------------------------------------------------------------------
-- C-07 · «Users can view verified venues» es un SELECT de fila completa para
-- todo `authenticated`, y las migraciones 026, 069 y 071 fueron añadiendo
-- `tax_id`, `stripe_account_id`, `stripe_requirements` y
-- `platform_fee_percent` protegiendo sólo la escritura: cualquiera leía el
-- NIF, las rutas de los documentos subidos y la comisión negociada de todos
-- los locales aprobados. 071 exige is_admin() para CAMBIAR la comisión y nada
-- controlaba leerla.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.venues FROM authenticated;
REVOKE SELECT ON public.venues FROM anon;

GRANT SELECT (
    address, avg_spend, business_terms, city, contact_email, created_at,
    description, event_radius, id, instagram, is_platform, is_verified,
    latitude, logo_url, longitude, name, opening_hours, phone, region,
    stripe_charges_enabled, stripe_details_submitted, stripe_payouts_enabled,
    stripe_updated_at, type, updated_at, venue_id, verification_status, website
) ON public.venues TO authenticated;

/** La ficha completa del local propio, para su panel. */
CREATE OR REPLACE FUNCTION public.get_my_venue()
RETURNS SETOF public.venues
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM public.venues WHERE venue_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_venue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_venue() TO authenticated;

/** Los locales pendientes de verificar, con NIF y documentos. Sólo admin. */
CREATE OR REPLACE FUNCTION public.admin_pending_venues()
RETURNS SETOF public.venues
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    RETURN QUERY
    SELECT * FROM public.venues
     WHERE verification_status = 'pending'
     ORDER BY created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pending_venues() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pending_venues() TO authenticated;

-- ---------------------------------------------------------------------------
-- A-02 · `event-photos` se creó con public = TRUE, y en un bucket público
-- Supabase sirve por /object/public/… sin consultar RLS siquiera: la foto de
-- esta noche —lo que más protege la capa SQL— se descargaba sin sesión con
-- sólo conocer la ruta, y se seguía descargando después de que
-- `purge_ended_event_photos` (053) debiera haberla retirado.
--
-- El bucket pasa a privado. Lo guardado en la base de datos sigue siendo la
-- URL con forma pública (es la forma canónica, la que usa `storagePathFromUrl`
-- para borrar); el cliente la firma al pintarla y `moderate-photo` firma la
-- suya para que Sightengine pueda descargarla.
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = FALSE WHERE id = 'event-photos';

DROP POLICY IF EXISTS "Event photos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Event photos are readable by peers" ON storage.objects;

/**
 * Quién puede firmar una foto del evento: su dueño, quien comparte fiesta con
 * él ahora mismo, sus matches y la administración. Las mismas reglas que la
 * política de `profiles`, que es de donde sale la foto en el tablón.
 *
 * La primera carpeta de la ruta es el uid de auth (lo exige la policy de
 * subida), así que de ahí sale el perfil.
 */
CREATE POLICY "Event photos are readable by peers"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'event-photos'
        AND (
            (storage.foldername(name))[1] = auth.uid()::TEXT
            OR public.is_admin()
            OR EXISTS (
                SELECT 1
                FROM public.profiles p
                WHERE p.user_id::TEXT = (storage.foldername(name))[1]
                  AND (
                      public.are_connected(public.current_profile_id(), p.id)
                      OR public.shares_active_event(public.current_profile_id(), p.id)
                  )
            )
        )
    );
