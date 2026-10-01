-- 073: al borrar una cuenta, las ventas del local no desaparecen.
--
-- `ticket_orders` y `tickets` colgaban de `profiles` con ON DELETE CASCADE:
-- si alguien que había comprado entradas borraba su cuenta, el local perdía
-- esos pedidos de sus ventas, de sus devoluciones y de las comisiones de sus
-- RRPP. Ahora se quedan sin persona (anónimos), que es lo que dicen los textos
-- legales: los datos de las compras se conservan, bloqueados, lo que exige la
-- ley.

ALTER TABLE public.ticket_orders ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN profile_id DROP NOT NULL;

ALTER TABLE public.ticket_orders DROP CONSTRAINT IF EXISTS ticket_orders_profile_id_fkey;
ALTER TABLE public.ticket_orders
    ADD CONSTRAINT ticket_orders_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_profile_id_fkey;
ALTER TABLE public.tickets
    ADD CONSTRAINT tickets_profile_id_fkey
    FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Los pedidos de cuentas borradas siguen saliendo en Ventas, sin nombre.
DO $$
DECLARE
    v_def TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_ticket_orders';

    v_def := replace(v_def, 'JOIN public.profiles p ON p.id = o.profile_id',
                            'LEFT JOIN public.profiles p ON p.id = o.profile_id');
    EXECUTE v_def;
END;
$$;
