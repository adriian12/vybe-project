-- ============================================================================
-- 128 · Coordenadas de las fiestas del escáner que estaban mal
-- ============================================================================
-- Resident Advisor da a muchas salas coordenadas en grados enteros o con dos
-- decimales ((41, 2), (40, -4)): caían a decenas de kilómetros. Recalculadas
-- el 03-11-2026 con la búsqueda nueva de `scan-sync` (Nominatim con el número
-- de portal y, si no, Photon validado). Sauvage se deja: por nombre salía en
-- otra calle y su punto ya estaba cerca. Noxe no se encontró.
-- Sólo cambia filas que siguen con el punto viejo.
-- ============================================================================

UPDATE public.events SET latitude = 41.3913093, longitude = 2.1726773 WHERE external_source = 'scan' AND place_name = '303 Audiophile Bar' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 41.3825375, longitude = 2.1663652 WHERE external_source = 'scan' AND place_name = '7833 Soundlab' AND latitude = 41.38 AND longitude = 2.17;
UPDATE public.events SET latitude = 40.3907207, longitude = -3.6696092 WHERE external_source = 'scan' AND place_name = 'Acme Estudio' AND latitude = 40.39 AND longitude = -3.67;
UPDATE public.events SET latitude = 40.4223974, longitude = -3.710121 WHERE external_source = 'scan' AND place_name = 'Araña Club' AND latitude = 40.42 AND longitude = -3.71;
UPDATE public.events SET latitude = 41.3771979, longitude = 2.1756741 WHERE external_source = 'scan' AND place_name = 'Arts Santa Mònica' AND latitude = 41.38 AND longitude = 2.18;
UPDATE public.events SET latitude = 41.3894609, longitude = 2.1370323 WHERE external_source = 'scan' AND place_name = 'Bikini Club' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 40.4195384, longitude = -3.7079635 WHERE external_source = 'scan' AND place_name = 'Café Berlín' AND latitude = 40 AND longitude = -4;
UPDATE public.events SET latitude = 41.393099, longitude = 2.1568896 WHERE external_source = 'scan' AND place_name = 'Chica Club' AND latitude = 41.39 AND longitude = 2.16;
UPDATE public.events SET latitude = 41.3841851, longitude = 2.1841441 WHERE external_source = 'scan' AND place_name = 'Círculo' AND latitude = 41.38 AND longitude = 2.18;
UPDATE public.events SET latitude = 40.4247168, longitude = -3.7122142 WHERE external_source = 'scan' AND place_name = 'Fitz Club' AND latitude = 40 AND longitude = -4;
UPDATE public.events SET latitude = 40.4326651, longitude = -3.6771134 WHERE external_source = 'scan' AND place_name = 'Fonico' AND latitude = 40.43 AND longitude = -3.68;
UPDATE public.events SET latitude = 40.4254007, longitude = -3.6829257 WHERE external_source = 'scan' AND place_name = 'Goya Social Club' AND latitude = 40 AND longitude = -4;
UPDATE public.events SET latitude = 41.3905581, longitude = 2.1726186 WHERE external_source = 'scan' AND place_name = 'Hotel Negresco Princess' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 41.3823855, longitude = 2.1641966 WHERE external_source = 'scan' AND place_name = 'La Paloma' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 41.4014693, longitude = 2.1569785 WHERE external_source = 'scan' AND place_name = 'Lakontra de Gràcia' AND latitude = 41.4 AND longitude = 2.16;
UPDATE public.events SET latitude = 40.3722352, longitude = -3.6465257 WHERE external_source = 'scan' AND place_name = 'Lasociaciøn' AND latitude = 40 AND longitude = -4;
UPDATE public.events SET latitude = 41.3806421, longitude = 2.1806944 WHERE external_source = 'scan' AND place_name = 'Mad Radio' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 40.4570275, longitude = -3.6924252 WHERE external_source = 'scan' AND place_name = 'Next Clubbing' AND latitude = 40 AND longitude = -4;
UPDATE public.events SET latitude = 41.3688468, longitude = 2.1468564 WHERE external_source = 'scan' AND place_name = 'Opposite' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 41.3897663, longitude = 2.1227398 WHERE external_source = 'scan' AND place_name = 'Pedro Son Studio' AND latitude = 41.42 AND longitude = 2.21;
UPDATE public.events SET latitude = 40.4098644, longitude = -3.7082016 WHERE external_source = 'scan' AND place_name = 'Rastro Live Studio' AND latitude = 40.41 AND longitude = -3.71;
UPDATE public.events SET latitude = 41.3972585, longitude = 2.1916091 WHERE external_source = 'scan' AND place_name = 'Razzmatazz 3' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 41.3909048, longitude = 2.1659455 WHERE external_source = 'scan' AND place_name = 'Safestay Rooftop' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 41.3942456, longitude = 2.1885237 WHERE external_source = 'scan' AND place_name = 'Sala Ágape Cuerpo y Arte' AND latitude = 41.39 AND longitude = 2.19;
UPDATE public.events SET latitude = 40.4174651, longitude = -3.6989333 WHERE external_source = 'scan' AND place_name = 'Sala Cocó' AND latitude = 40 AND longitude = -4;
UPDATE public.events SET latitude = 40.4278334, longitude = -3.6846048 WHERE external_source = 'scan' AND place_name = 'Subcero Club' AND latitude = 40.43 AND longitude = -3.68;
UPDATE public.events SET latitude = 41.3883171, longitude = 2.1659902 WHERE external_source = 'scan' AND place_name = 'Teatre Coliseum' AND latitude = 41.39 AND longitude = 2.17;
UPDATE public.events SET latitude = 40.484831, longitude = -3.677728 WHERE external_source = 'scan' AND place_name = 'The Garage' AND latitude = 40.49 AND longitude = -3.68;
UPDATE public.events SET latitude = 41.3967232, longitude = 2.2011437 WHERE external_source = 'scan' AND place_name = 'The lab Barcelona' AND latitude = 41.4 AND longitude = 2.2;
UPDATE public.events SET latitude = 40.484831, longitude = -3.677728 WHERE external_source = 'scan' AND place_name = 'The Lenovo Garage' AND latitude = 40.49 AND longitude = -3.68;
UPDATE public.events SET latitude = 41.3828056, longitude = 2.1787426 WHERE external_source = 'scan' AND place_name = 'The Supermercat Gotico' AND latitude = 41 AND longitude = 2;
UPDATE public.events SET latitude = 41.3957024, longitude = 2.1899915 WHERE external_source = 'scan' AND place_name = 'Theodora Extra' AND latitude = 41.4 AND longitude = 2.19;
