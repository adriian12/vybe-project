-- ============================================================================
-- 038 · Sin GraphQL
--
-- Vybe habla con la base de datos por REST (PostgREST) y RPC; no usa GraphQL en
-- ningún sitio. Con `pg_graphql` activo, cualquier usuario con sesión podía
-- descubrir en el esquema GraphQL todas las tablas sobre las que tiene SELECT,
-- y el asesor de seguridad lo marcaba 36 veces. Se desactiva.
--
-- Si algún día hace falta: Database → Extensions → pg_graphql, o
--   CREATE EXTENSION pg_graphql WITH SCHEMA graphql;
-- ============================================================================

DROP EXTENSION IF EXISTS pg_graphql;
