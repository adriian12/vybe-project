"""Genera `supabase/seeds/mallorca_test_data.sql`: datos de prueba de Mallorca.

    python scripts/generate-seed.py

Crea 50 personas (28 mujeres y 22 hombres, de 18 a 44 años, con preferencias
variadas), 19 locales reales de Mallorca con fiestas inventadas pero
verosímiles, y una «Sala de pruebas» que administración puede llevar a su
ubicación con `admin_reset_test_lab()` (migración 035).

Todo va con correos `@seed.vybe.test`, así que se borra entero con
`supabase/seeds/mallorca_test_data_cleanup.sql`. Las fechas de las fiestas son
absolutas (septiembre y octubre de 2026, hora de Madrid): si se ejecuta más
tarde, cambia `FECHAS` o la sala de pruebas seguirá siendo la única en marcha.

La contraseña de las cuentas sale de `SEED_PASSWORD` (entorno o `.env`) y no
está en el repositorio: las cuentas viven en el proyecto de verdad y cualquiera
que leyera el código podría entrar con ellas. Por lo mismo, el SQL generado está
en `.gitignore`.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'supabase' / 'seeds' / 'mallorca_test_data.sql'


def read_password():
    value = os.environ.get('SEED_PASSWORD')
    env = ROOT / '.env'
    if not value and env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if line.startswith('SEED_PASSWORD='):
                value = line.split('=', 1)[1].strip().strip('"').strip("'")
    if not value or len(value) < 8:
        sys.exit('Falta SEED_PASSWORD (mínimo 8 caracteres) en el entorno o en .env.')
    return value


PASSWORD = read_password()
DOMAIN = 'seed.vybe.test'


def q(value):
    """Literal SQL."""
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return 'TRUE' if value else 'FALSE'
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, tuple)):
        return 'ARRAY[' + ', '.join(q(v) for v in value) + ']::text[]'
    return "'" + str(value).replace("'", "''") + "'"


def face(img):
    return f'https://i.pravatar.cc/600?img={img}'


def poster(photo_id):
    return f'https://images.unsplash.com/{photo_id}?w=1200&q=75&auto=format&fit=crop'


P = {
    'festival_colores': 'photo-1514525253161-7a46d19cd819',
    'dj': 'photo-1470225620780-dba8ba36b745',
    'confeti': 'photo-1492684223066-81342ee5ff30',
    'escenario': 'photo-1516450360452-9312f5e86fc7',
    'multitud_lila': 'photo-1540039155733-5bb30b53aa14',
    'festival_noche': 'photo-1506157786151-b8491531f063',
    'manos': 'photo-1429962714451-bb934ecdc4ec',
    'club_movil': 'photo-1501281668745-f7f57925c3b4',
    'concierto_amarillo': 'photo-1459749411175-04bf5292ceea',
    'confeti_blanco': 'photo-1533174072545-7a4b6ad7a6c3',
    'club_oscuro': 'photo-1574391884720-bbc3740c59d1',
    'tunel_luces': 'photo-1566737236500-c8ac43014a67',
    'coctel': 'photo-1514362545857-3bc16c4c7d1b',
    'microfono': 'photo-1511671782779-c97d3d27a1d4',
    'saxo': 'photo-1415201364774-f6f0bb35f28f',
    'brindis': 'photo-1519671482749-fd09be7ccebf',
    'amigos': 'photo-1541532713592-79a0317b6b77',
    'sala_escenario': 'photo-1504680177321-2e6a879aac86',
    'club_rojo': 'photo-1545128485-c400e7702796',
    'guitarra': 'photo-1598387993441-a364f854c3e1',
    'concierto_calido': 'photo-1470229722913-7c0e2dbbafd3',
    'concierto_naranja': 'photo-1524368535928-5b5e00ddc76b',
    'terraza_dia': 'photo-1517457373958-b7bdd4587205',
}

# ---------------------------------------------------------------------------
# Locales: clave, nombre, tipo, municipio, dirección, lat, lng, radio.
# Coordenadas aproximadas a partir de la dirección pública del local.
# ---------------------------------------------------------------------------
VENUES = [
    ('titos', "Tito's Mallorca", 'discoteca', 'Palma', 'Passeig Marítim, 33', 39.5657, 2.6305, 100),
    ('bcm', 'BCM Planet Dance', 'discoteca', 'Calvià', "Avinguda S'Olivera, Magaluf", 39.5106, 2.5359, 100),
    ('tokio', "Tokio Joe's", 'discoteca', 'Calvià', 'Carrer de Punta Ballena, Magaluf', 39.5098, 2.5373, 100),
    ('megapark', 'Megapark Mallorca', 'discoteca', 'Palma', 'Platja de Palma, Balneari 6', 39.5058, 2.7489, 100),
    ('bierkonig', 'Bierkönig', 'bar', 'Palma', 'Carrer del Pare Bartomeu Salvà, Platja de Palma', 39.5047, 2.7502, 50),
    ('oberbayern', 'Oberbayern Mallorca', 'local', 'Llucmajor', "s'Arenal", 39.5007, 2.7556, 50),
    ('nikki', 'Nikki Beach Mallorca', 'local', 'Calvià', 'Avinguda Notari Alemany, 1, Magaluf', 39.5079, 2.5393, 50),
    ('purobeach', 'Purobeach Palma', 'local', 'Palma', 'Carrer Pagell, 1, Can Pastilla', 39.5376, 2.7143, 50),
    ('anima', 'Anima Beach Palma', 'local', 'Palma', "Platja de Can Pere Antoni", 39.5634, 2.6541, 50),
    ('jazzvoyeur', 'Jazz Voyeur Club', 'bar', 'Palma', 'Carrer dels Apuntadors, 5', 39.5680, 2.6473, 50),
    ('abaco', 'Abaco', 'bar', 'Palma', 'Carrer de Sant Joan, 1', 39.5684, 2.6466, 50),
    ('hostalcuba', 'Hostal Cuba Sky Bar', 'bar', 'Palma', 'Carrer de Sant Magí, 1, Santa Catalina', 39.5712, 2.6388, 50),
    ('garito', 'Garito Café', 'bar', 'Palma', 'Dàrsena de Can Barberà', 39.5611, 2.6119, 50),
    ('esgremi', 'Es Gremi', 'local', 'Palma', 'Carrer Gremi de Porgadors, 16, Son Castelló', 39.5959, 2.6435, 50),
    ('coliseo', 'Coliseo Balear', 'festival', 'Palma', 'Carrer del Gremi de Sucrers', 39.5795, 2.6555, 500),
    ('mallorcalive', 'Mallorca Live Festival', 'festival', 'Calvià', 'Antic Aquapark de Magaluf', 39.5163, 2.5296, 500),
    ('pirates', 'Pirates Adventure', 'local', 'Calvià', 'Camí de Sa Porrassa, Magaluf', 39.5178, 2.5476, 50),
    ('bolero', 'Bolero Cala Ratjada', 'discoteca', 'Capdepera', 'Carrer Elionor Servera, Cala Rajada', 39.7121, 3.4611, 100),
    ('physical', 'Physical Cala Ratjada', 'discoteca', 'Capdepera', 'Carrer Elionor Servera, Cala Rajada', 39.7106, 3.4622, 100),
    # Se mueve a la ubicación de quien prueba con admin_reset_test_lab().
    ('lab', 'Vybe · Sala de pruebas', 'discoteca', 'Palma', 'Ubicación de pruebas', 39.5754, 2.6545, 300),
]

# ---------------------------------------------------------------------------
# Fiestas: local, nombre, descripción, inicio, fin (hora de Madrid), género,
# vestimenta, edad mínima, precio, aforo, cartel, código si está en marcha.
# ---------------------------------------------------------------------------
EVENTS = [
    ('titos', "Tito's Tuesday · Urban & Reggaeton", 'La noche urbana del Paseo Marítimo: reggaeton, dembow y los temas del verano con vistas a la bahía.', '2026-09-15 23:30', '2026-09-16 06:00', 'Reggaeton', 'Arreglado', 18, 15, 1200, 'club_movil', '511201'),
    ('titos', 'Saturday Night Fever', 'House clásico y comercial en las dos salas. Reservados con botella disponibles.', '2026-09-19 23:30', '2026-09-20 06:00', 'House', 'Elegante', 21, 25, 1200, 'tunel_luces', None),
    ('titos', 'Closing Season Party', 'Última gran noche de la temporada en Tito\'s, con sesión techno hasta el amanecer.', '2026-10-10 23:30', '2026-10-11 06:30', 'Techno', 'Libre', 21, 30, 1200, 'confeti', None),
    ('bcm', 'BCM Foam Party', 'La fiesta de la espuma más grande de Magaluf. Trae ropa que se pueda mojar.', '2026-09-15 23:00', '2026-09-16 06:00', 'Dance', 'Bañador y chanclas', 18, 20, 3000, 'festival_colores', '511202'),
    ('bcm', 'BCM Big Room Night', 'EDM y big room con cañones de CO2 y visuales en la pantalla gigante.', '2026-09-18 23:00', '2026-09-19 06:00', 'EDM', 'Libre', 18, 25, 3000, 'multitud_lila', None),
    ('tokio', "Tokio Joe's Student Night", 'Pop, hits y chupitos a precio de estudiante en el corazón de Punta Ballena.', '2026-09-15 22:30', '2026-09-16 05:00', 'Pop', 'Libre', 18, 10, 600, 'confeti_blanco', '511203'),
    ('tokio', 'Hip Hop Fridays', 'Hip hop, R&B y trap con DJs residentes.', '2026-09-18 22:30', '2026-09-19 05:00', 'Hip Hop', 'Urbano', 18, 12, 600, 'amigos', None),
    ('megapark', 'Megapark Schlager Night', 'Schlager en directo, cerveza y el ambiente de Platja de Palma. Entrada libre.', '2026-09-16 20:00', '2026-09-17 04:00', 'Schlager', 'Libre', 18, 0, 2500, 'manos', None),
    ('megapark', 'Mallorca Party Weekend', 'Artistas invitados en el escenario principal durante toda la noche del sábado.', '2026-09-19 18:00', '2026-09-20 04:00', 'Pop', 'Libre', 18, 0, 2500, 'concierto_calido', None),
    ('bierkonig', 'Bierkönig Live Session', 'Música en directo, jarras de litro y fiesta alemana hasta las tres.', '2026-09-15 20:00', '2026-09-16 03:00', 'Schlager', 'Libre', 18, 0, 1500, 'concierto_amarillo', '511204'),
    ('bierkonig', 'Die große Samstagsparty', 'La fiesta grande del sábado con los artistas de la temporada.', '2026-09-19 20:00', '2026-09-20 03:00', 'Schlager', 'Libre', 18, 0, 1500, 'concierto_naranja', None),
    ('oberbayern', 'Oktoberfest Mallorca', 'Banda bávara, codillo y cerveza de temporada. Traje tradicional opcional.', '2026-09-25 19:00', '2026-09-26 03:00', 'Schlager', 'Tracht (opcional)', 18, 12, 1200, 'brindis', None),
    ('nikki', 'Nikki Beach White Party', 'La fiesta blanca de Nikki Beach: DJ, percusión en directo y champán frente al mar.', '2026-09-19 13:00', '2026-09-19 21:00', 'House', 'Todo blanco', 21, 45, 800, 'terraza_dia', None),
    ('nikki', 'Sunday Brunch & Beats', 'Brunch mediterráneo con sesión deep house al borde de la piscina.', '2026-09-20 12:30', '2026-09-20 19:00', 'Deep House', 'Beachwear elegante', 18, 35, 800, 'coctel', None),
    ('purobeach', 'Sunset Sessions', 'Deep house al atardecer en la punta de Can Pastilla.', '2026-09-18 18:00', '2026-09-19 00:00', 'Deep House', 'Casual elegante', 18, 20, 500, 'brindis', None),
    ('anima', 'Anima Beach Sunday Social', 'Domingo de playa, cócteles y house en la bahía de Palma.', '2026-09-20 13:00', '2026-09-20 21:00', 'House', 'Beachwear', 18, 15, 600, 'terraza_dia', None),
    ('jazzvoyeur', 'Jam Session de los miércoles', 'Músicos de la isla suben al escenario sin guion. Llega pronto, se llena.', '2026-09-16 21:30', '2026-09-17 01:30', 'Jazz', 'Libre', 18, 8, 120, 'saxo', None),
    ('jazzvoyeur', 'Latin Jazz Night', 'Cuarteto de latin jazz en directo en La Lonja.', '2026-09-18 22:00', '2026-09-19 02:00', 'Jazz', 'Libre', 18, 12, 120, 'microfono', None),
    ('abaco', 'Noches de Ópera en Abaco', 'Cócteles entre flores y arias en uno de los palacios más bonitos del casco antiguo.', '2026-09-17 21:00', '2026-09-18 02:00', 'Clásica', 'Elegante', 18, 18, 150, 'coctel', None),
    ('hostalcuba', 'Sky Bar Sunset DJ', 'DJ en la azotea de Santa Catalina con la catedral al fondo.', '2026-09-16 19:00', '2026-09-17 01:00', 'Deep House', 'Casual', 18, 0, 200, 'concierto_calido', None),
    ('garito', 'Garito Friday · Disco & Funk', 'Disco, funk y soul frente al puerto deportivo.', '2026-09-18 22:00', '2026-09-19 03:30', 'Disco', 'Libre', 18, 10, 400, 'club_rojo', None),
    ('esgremi', 'Indie Mallorquí en directo', 'Tres bandas de la escena local en el escenario grande de Es Gremi.', '2026-09-18 21:00', '2026-09-19 00:30', 'Indie', 'Libre', 18, 18, 900, 'guitarra', None),
    ('esgremi', 'Tributo a Queen', 'Dos horas de clásicos de Queen con banda completa.', '2026-09-26 21:30', '2026-09-27 00:30', 'Rock', 'Libre', 18, 22, 900, 'escenario', None),
    ('coliseo', 'Mallorca Latin Fest', 'Salsa, bachata y reggaeton en directo en la antigua plaza de toros.', '2026-09-26 20:00', '2026-09-27 02:00', 'Latin', 'Libre', 18, 35, 9000, 'festival_noche', None),
    ('mallorcalive', 'Mallorca Live · Autumn Edition', 'Una jornada de electrónica e indie con dos escenarios al aire libre.', '2026-10-03 16:00', '2026-10-04 04:00', 'Electrónica', 'Libre', 18, 49, 20000, 'festival_colores', None),
    ('pirates', 'Pirates Reloaded', 'El espectáculo pirata para adultos: acrobacias, música y fiesta final en la pista.', '2026-09-17 21:00', '2026-09-18 00:30', 'Espectáculo', 'Libre', 18, 55, 800, 'confeti_blanco', None),
    ('bolero', 'Bolero Classics', 'House y clásicos de pista en la discoteca de referencia de Cala Rajada.', '2026-09-19 23:00', '2026-09-20 06:00', 'House', 'Libre', 18, 15, 1000, 'club_oscuro', None),
    ('physical', 'Physical Tuesday Madness', 'EDM y hits de festival en el centro de Cala Rajada.', '2026-09-15 23:00', '2026-09-16 06:00', 'EDM', 'Libre', 18, 12, 900, 'club_rojo', '511205'),
    ('physical', 'Physical Farewell Summer', 'Despedida del verano con DJs invitados y lluvia de confeti.', '2026-10-03 23:00', '2026-10-04 06:00', 'EDM', 'Libre', 18, 20, 900, 'multitud_lila', None),
]

# ---------------------------------------------------------------------------
# Personas: nombre, sexo, edad, a quién quiere ver, foto (pravatar), idiomas,
# intereses, bio, plan de esta noche, dónde está ahora.
# ---------------------------------------------------------------------------
W, M = 'woman', 'man'
PEOPLE = [
    ('Aina Vidal', W, 23, 'men', 5, ['es', 'ca'], ['techno', 'dancing', 'meet_people'], 'De Sóller. Si hay techno, estoy en primera fila.', 'Bailar hasta que cierren', 'lab'),
    ('Carla Serra', W, 27, 'all', 9, ['es', 'ca', 'en'], ['house', 'cocktails', 'friends'], 'Diseñadora gráfica. Busco gente con buen gusto musical.', 'Una copa en la barra de fuera', 'lab'),
    ('Noa Pons', W, 21, 'men', 10, ['es', 'ca'], ['reggaeton', 'dancing', 'afterparty'], 'Estudio en la UIB. El reggaeton me puede.', 'Afterparty seguro', 'lab'),
    ('Valentina Rossi', W, 29, 'men', 16, ['it', 'en', 'es'], ['house', 'terrace', 'dating'], 'Italiana en Palma desde hace dos veranos. Sunset y buena conversación.', 'Terraza y luego pista', 'lab'),
    ('Marta Oliver', W, 32, 'all', 19, ['es', 'ca'], ['live_music', 'rock', 'friends'], 'Enfermera de noche, fiestera de día libre.', 'Concierto y a casa pronto', 'titos'),
    ('Julia Roig', W, 25, 'men', 20, ['es', 'ca', 'en'], ['pop', 'dancing', 'meet_people'], 'Profe de pilates. Me apunto a cualquier plan con música.', 'Cantar a gritos', 'lab'),
    ('Lena Fischer', W, 26, 'all', 21, ['de', 'en'], ['techno', 'chill', 'meet_people'], 'Aus Berlin, de vacaciones una semana. Show me the island!', 'Conocer gente nueva', 'lab'),
    ('Paula Ferrer', W, 19, 'men', 23, ['es'], ['reggaeton', 'pop', 'friends'], 'Primer verano en Mallorca con mis amigas.', 'Salir con las amigas', 'bcm'),
    ('Emma Johansson', W, 24, 'men', 24, ['sv', 'en'], ['house', 'cocktails', 'dating'], 'Swedish, working the season in Magaluf. Love a good sunset.', 'Cocktails first', 'lab'),
    ('Irene Bauzà', W, 34, 'men', 25, ['es', 'ca'], ['jazz', 'live_music', 'cocktails'], 'Arquitecta. Jazz, vino y nada de prisas.', 'Jazz y una copa', 'lab'),
    ('Sara Moyà', W, 22, 'women', 26, ['es', 'ca'], ['techno', 'afterparty', 'dating'], 'Fotógrafa. Si me ves con la cámara, sonríe.', 'After en la playa', 'lab'),
    ('Laura Mas', W, 28, 'all', 27, ['es', 'ca', 'en'], ['latin', 'dancing', 'meet_people'], 'Bailo salsa los jueves y lo que sea el resto de la semana.', 'Salsa y bachata', 'lab'),
    ('Chloé Martin', W, 30, 'men', 28, ['fr', 'en', 'es'], ['house', 'terrace', 'cocktails'], 'Française à Palma. Rooftops, rosé et bonne musique.', 'Rooftop', 'lab'),
    ('Maria Sastre', W, 20, 'men', 29, ['es', 'ca'], ['pop', 'reggaeton', 'friends'], 'De Manacor. Hoy salimos todas.', 'Fiesta con las de siempre', 'tokio'),
    ('Alba Crespí', W, 26, 'all', 30, ['es', 'ca'], ['techno', 'house', 'afterparty'], 'Productora de eventos. Siempre buscando la próxima sesión.', 'Ver al DJ invitado', 'lab'),
    ('Hannah Müller', W, 23, 'men', 31, ['de', 'en'], ['pop', 'dancing', 'dating'], 'Hamburgerin im Urlaub. Ich tanze gern!', 'Tanzen', 'bierkonig'),
    ('Elena Bonet', W, 37, 'men', 32, ['es', 'ca'], ['jazz', 'chill', 'networking'], 'Abogada. Planes tranquilos, gente interesante.', 'Algo tranquilo', 'lab'),
    ('Daniela Ruiz', W, 25, 'all', 34, ['es', 'en'], ['latin', 'reggaeton', 'dancing'], 'Colombiana en Palma. Si suena bachata, me levanto.', 'Bailar toda la noche', 'lab'),
    ('Camila Torres', W, 29, 'men', 35, ['es', 'en'], ['house', 'terrace', 'meet_people'], 'Trabajo en un beach club. Hoy me toca estar al otro lado.', 'Descansar bailando', 'titos'),
    ('Nerea Garau', W, 18, 'men', 36, ['es', 'ca'], ['pop', 'friends', 'dancing'], 'Acabo de cumplir 18 y es mi primera temporada.', 'Estrenar la mayoría de edad', 'bcm'),
    ('Sofía Castro', W, 31, 'women', 38, ['es', 'en'], ['cocktails', 'live_music', 'dating'], 'Bartender. Te preparo el mejor mojito de la isla.', 'Probar cócteles', 'lab'),
    ('Olivia Brown', W, 27, 'all', 40, ['en'], ['techno', 'afterparty', 'meet_people'], 'From Manchester, living in Santa Catalina. Up for anything.', 'Anything goes', 'lab'),
    ('Clara Riera', W, 24, 'men', 43, ['es', 'ca'], ['rock', 'live_music', 'friends'], 'Guitarrista en una banda de Inca.', 'Concierto en Es Gremi', 'physical'),
    ('Inés Morey', W, 33, 'all', 44, ['es', 'ca', 'en'], ['house', 'chill', 'networking'], 'Marketing en una startup de Palma. Música electrónica y buena gente.', 'Networking con copa', 'lab'),
    ('Mia Schneider', W, 22, 'men', 45, ['de', 'en'], ['dancing', 'pop', 'dating'], 'Studentin aus München. Erste Nacht auf Mallorca!', 'Erste Party', 'bierkonig'),
    ('Andrea Alemany', W, 41, 'men', 47, ['es', 'ca'], ['jazz', 'cocktails', 'dating'], 'Separada, feliz y con ganas de volver a salir.', 'Cena y copa', 'lab'),
    ('Laia Fornés', W, 26, 'women', 48, ['ca', 'es'], ['techno', 'dancing', 'friends'], 'De Pollença. Techno y montaña, por ese orden.', 'Techno hasta tarde', 'lab'),
    ('Zoe Williams', W, 28, 'all', 49, ['en', 'es'], ['latin', 'terrace', 'meet_people'], 'Dance teacher from London. Salsa is my love language.', 'Latin night', 'lab'),
    ('Pau Llull', M, 29, 'women', 3, ['es', 'ca'], ['techno', 'afterparty', 'dating'], 'Ingeniero de sonido. Te explico por qué suena tan bien este club.', 'Escuchar al DJ', 'lab'),
    ('Marc Coll', M, 22, 'women', 7, ['es', 'ca'], ['reggaeton', 'dancing', 'friends'], 'Estudiante de ADE. Hoy invito yo a la primera.', 'Liarla con los colegas', 'tokio'),
    ('Álex Martorell', M, 25, 'all', 8, ['es', 'ca', 'en'], ['pop', 'dancing', 'meet_people'], 'Monitor de vela. Buen rollo garantizado.', 'Conocer gente', 'lab'),
    ('Toni Amengual', M, 34, 'women', 11, ['es', 'ca'], ['rock', 'live_music', 'cocktails'], 'Cocinero. Si hablamos de comida, no paro.', 'Concierto y cervezas', 'lab'),
    ('Joan Salvà', M, 24, 'women', 12, ['ca', 'es'], ['house', 'terrace', 'dating'], 'Surfista de invierno, fiestero de verano.', 'Terraza y pista', 'lab'),
    ('Biel Rosselló', M, 31, 'all', 13, ['es', 'ca', 'en'], ['techno', 'chill', 'networking'], 'Desarrollador. Me gustan las raves y las charlas largas.', 'Rave tranquila', 'lab'),
    ('Luca Bianchi', M, 27, 'women', 14, ['it', 'en', 'es'], ['house', 'cocktails', 'dating'], 'Italiano, chef en Portals. Vengo a bailar.', 'Bailar', 'titos'),
    ('David Nicolau', M, 38, 'women', 18, ['es', 'ca'], ['jazz', 'cocktails', 'networking'], 'Empresario del sector turístico. Jazz y buena compañía.', 'Una copa tranquila', 'lab'),
    ('Kwame Mensah', M, 30, 'women', 51, ['en', 'fr'], ['latin', 'dancing', 'meet_people'], 'From Accra via Paris. Afrobeats, salsa, anything with rhythm.', 'Dance all night', 'lab'),
    ('Jonas Weber', M, 26, 'women', 52, ['de', 'en'], ['techno', 'afterparty', 'friends'], 'Aus Köln, Urlaub mit Freunden.', 'Party mit Freunden', 'bierkonig'),
    ('Hugo Llompart', M, 23, 'men', 53, ['es', 'ca'], ['pop', 'dancing', 'dating'], 'Estudio Turismo. Siempre en la pista.', 'Pop y más pop', 'lab'),
    ('Rubén Oliver', M, 28, 'all', 54, ['es', 'en'], ['house', 'terrace', 'meet_people'], 'Fisioterapeuta. Primero terraza, después ya veremos.', 'Terraza', 'lab'),
    ('Nicolás Vega', M, 32, 'women', 55, ['es', 'en'], ['live_music', 'jazz', 'dating'], 'Violinista. Toco los jueves en La Lonja.', 'Música en directo', 'lab'),
    ('Iván Torrens', M, 21, 'women', 56, ['es'], ['reggaeton', 'afterparty', 'friends'], 'Camarero en Magaluf. Hoy libro.', 'Salir por Punta Ballena', 'bcm'),
    ('Oliver Smith', M, 25, 'women', 57, ['en'], ['techno', 'dancing', 'dating'], 'Londoner on holiday. Where is the best techno?', 'Techno', 'lab'),
    ('Guillem Pascual', M, 27, 'men', 58, ['ca', 'es'], ['house', 'cocktails', 'dating'], 'Fotógrafo de bodas los findes, fiestero el resto.', 'Cócteles y house', 'lab'),
    ('Samuel Duarte', M, 35, 'women', 59, ['pt', 'es'], ['latin', 'live_music', 'meet_people'], 'Brasileño en Mallorca. Samba, forró y buen ambiente.', 'Bailar forró', 'physical'),
    ('Jaume Riutort', M, 29, 'all', 60, ['ca', 'es'], ['rock', 'live_music', 'friends'], 'Batería en una banda de rock de Palma.', 'Concierto', 'lab'),
    ('Tomás Arbona', M, 33, 'women', 61, ['es', 'ca'], ['chill', 'cocktails', 'dating'], 'Sumiller. Pregúntame por el vino de la isla.', 'Copa de vino', 'titos'),
    ('Carlos Mendoza', M, 44, 'women', 64, ['es', 'en'], ['jazz', 'chill', 'networking'], 'Productor musical. Llevo 20 años en la noche de Palma.', 'Ver una jam', 'lab'),
    ('Matteo Conti', M, 24, 'all', 67, ['it', 'en'], ['techno', 'afterparty', 'meet_people'], 'Fotografo italiano. Mi piace la musica elettronica.', 'Afterparty', 'lab'),
    ('Víctor Cerdà', M, 30, 'women', 68, ['es', 'ca'], ['house', 'dancing', 'dating'], 'Abogado de día, house de noche.', 'House hasta el cierre', 'bcm'),
]

# Eventos futuros a los que cada persona dice que va (índices en EVENTS).
FUTUROS = [i for i, e in enumerate(EVENTS) if e[11] is None]


def slug(nombre):
    base = (nombre.lower()
            .replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
            .replace('à', 'a').replace('è', 'e').replace('ò', 'o').replace('ï', 'i').replace('ü', 'u')
            .replace('ñ', 'n').replace('ç', 'c').replace("'", ''))
    return '.'.join(base.split())


def main():
    assert len(PEOPLE) == 50, len(PEOPLE)
    assert len(VENUES) == 20, len(VENUES)
    for p in PEOPLE:
        assert 18 <= p[2] <= 100 and p[1] in (W, M) and p[3] in ('men', 'women', 'all')

    sql = []
    sql.append(f"""-- ============================================================================
-- Datos de prueba de Mallorca · generado por scripts/generate-seed.py
--
-- 50 personas, 19 locales reales de Mallorca con fiestas verosímiles (las
-- fiestas son inventadas: no es una agenda real) y la «Sala de pruebas», que
-- administración mueve a su ubicación con admin_reset_test_lab() (035).
--
-- Cuentas con correo @{DOMAIN}; la contraseña es la de SEED_PASSWORD. Sólo
-- para pruebas. Este fichero lleva la contraseña: no se sube al repositorio.
-- Se borra todo con supabase/seeds/mallorca_test_data_cleanup.sql.
-- Es idempotente: se puede ejecutar dos veces sin duplicar nada.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tablas de trabajo. Temporales de sesión (no ON COMMIT DROP): el editor SQL
-- y el MCP ejecutan cada sentencia en su propia transacción.
DROP TABLE IF EXISTS seed_accounts, seed_people, seed_venues, seed_events;
CREATE TEMP TABLE seed_accounts (email TEXT PRIMARY KEY, meta JSONB);
""")

    filas = []
    for p in PEOPLE:
        nombre, sexo, edad, quiere = p[0], p[1], p[2], p[3]
        email = f'{slug(nombre)}@{DOMAIN}'
        meta = f"jsonb_build_object('account_type','user','name',{q(nombre)},'age',{edad},'gender',{q(sexo)},'wants',{q(quiere)})"
        filas.append(f"    ({q(email)}, {meta})")
    for key, name, vtype, *_ in VENUES:
        email = 'sala-pruebas@' + DOMAIN if key == 'lab' else f'{key}@{DOMAIN}'
        meta = f"jsonb_build_object('account_type','venue','venue_name',{q(name)},'venue_type',{q(vtype)})"
        filas.append(f"    ({q(email)}, {meta})")
    sql.append('INSERT INTO seed_accounts (email, meta) VALUES\n' + ',\n'.join(filas) + ';\n')

    sql.append(f"""-- Cuentas en auth. El disparador handle_new_user() crea el perfil o el local.
DO $$
DECLARE
    v_instance UUID := COALESCE((SELECT id FROM auth.instances LIMIT 1), '00000000-0000-0000-0000-000000000000'::uuid);
    v_id UUID;
    a RECORD;
BEGIN
    FOR a IN SELECT * FROM seed_accounts LOOP
        CONTINUE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.email = a.email);
        v_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data, is_super_admin,
            confirmation_token, recovery_token, email_change_token_new, email_change
        ) VALUES (
            v_instance, v_id, 'authenticated', 'authenticated', a.email, crypt({q(PASSWORD)}, gen_salt('bf')),
            NOW(), NOW(), NOW(),
            '{{"provider":"email","providers":["email"]}}'::jsonb, a.meta, FALSE,
            '', '', '', ''
        );
        INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        VALUES (v_id::text, v_id,
                jsonb_build_object('sub', v_id::text, 'email', a.email, 'email_verified', true),
                'email', NOW(), NOW(), NOW());
    END LOOP;
END $$;
""")

    # ------------------------------------------------------------- perfiles
    filas = []
    for p in PEOPLE:
        nombre, sexo, edad, quiere, img, idiomas, intereses, bio, plan, donde = p
        email = f'{slug(nombre)}@{DOMAIN}'
        filas.append(
            f"    ({q(email)}, {q(bio)}, {q(plan)}, {q(idiomas)}, {q(face(img))}, {q(donde)}, {q(intereses)})"
        )
    sql.append("""-- Perfiles verificados, con foto, idiomas, plan e intereses.
CREATE TEMP TABLE seed_people (email TEXT PRIMARY KEY, bio TEXT, plan TEXT, languages TEXT[], photo TEXT, venue_key TEXT, interests TEXT[]);
INSERT INTO seed_people VALUES
""" + ',\n'.join(filas) + ';\n')

    sql.append("""UPDATE public.profiles p
SET bio = s.bio, plan_tonight = s.plan, languages = s.languages,
    photos = ARRAY[s.photo], avatar = s.photo,
    is_verified = TRUE, face_verified = TRUE, phone_verified = TRUE,
    status = 'active', locale = 'es'
FROM seed_people s
WHERE p.email = s.email;

DELETE FROM public.profile_interests pi
USING public.profiles p, seed_people s
WHERE pi.profile_id = p.id AND p.email = s.email;

INSERT INTO public.profile_interests (profile_id, interest_id)
SELECT p.id, i.id
FROM seed_people s
JOIN public.profiles p ON p.email = s.email
JOIN public.interests i ON i.slug = ANY (s.interests)
ON CONFLICT DO NOTHING;
""")

    # --------------------------------------------------------------- locales
    filas = []
    for key, name, vtype, city, address, lat, lng, radius in VENUES:
        email = 'sala-pruebas@' + DOMAIN if key == 'lab' else f'{key}@{DOMAIN}'
        filas.append(f"    ({q(key)}, {q(email)}, {q(city)}, {q(address)}, {lat}, {lng}, {radius})")
    sql.append("""-- Locales aprobados con ubicación, municipio y dirección.
CREATE TEMP TABLE seed_venues (key TEXT PRIMARY KEY, email TEXT, city TEXT, address TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, radius INTEGER);
INSERT INTO seed_venues VALUES
""" + ',\n'.join(filas) + """;

UPDATE public.venues v
SET latitude = CASE WHEN s.key = 'lab' AND v.latitude IS NOT NULL THEN v.latitude ELSE s.lat END,
    longitude = CASE WHEN s.key = 'lab' AND v.longitude IS NOT NULL THEN v.longitude ELSE s.lng END,
    city = s.city, region = 'Illes Balears', address = s.address,
    event_radius = s.radius, is_verified = TRUE, verification_status = 'approved'
FROM seed_venues s
WHERE v.email = s.email;
""")

    # ---------------------------------------------------------------- fiestas
    filas = []
    for idx, (vk, name, desc, ini, fin, theme, dress, edad, precio, aforo, cartel, codigo) in enumerate(EVENTS):
        filas.append(
            f"    ({idx}, {q(vk)}, {q(name)}, {q(desc)}, {q(ini + ':00 Europe/Madrid')}::timestamptz, "
            f"{q(fin + ':00 Europe/Madrid')}::timestamptz, {q(theme)}, {q(dress)}, {edad}, {precio}, {aforo}, "
            f"{q(poster(P[cartel]))}, {q(codigo)})"
        )
    lab_poster = poster(P['dj'])
    sql.append("""-- Fiestas. Las que tienen código son las que están en marcha al ejecutar el
-- seed (la noche del martes 15 de septiembre de 2026).
CREATE TEMP TABLE seed_events (idx INTEGER PRIMARY KEY, venue_key TEXT, name TEXT, description TEXT, starts TIMESTAMPTZ, ends TIMESTAMPTZ, theme TEXT, dress TEXT, min_age INTEGER, price NUMERIC, capacity INTEGER, poster TEXT, code TEXT);
INSERT INTO seed_events VALUES
""" + ',\n'.join(filas) + f""";

INSERT INTO public.events (venue_id, name, description, start_date, end_date, latitude, longitude,
                           theme, dress_code, min_age, price, max_capacity, poster_url, recurrence)
SELECT v.id, e.name, e.description, e.starts, e.ends, v.latitude, v.longitude,
       e.theme, e.dress, e.min_age, e.price, e.capacity, e.poster, 'none'
FROM seed_events e
JOIN seed_venues sv ON sv.key = e.venue_key
JOIN public.venues v ON v.email = sv.email
WHERE NOT EXISTS (SELECT 1 FROM public.events x WHERE x.venue_id = v.id AND x.name = e.name);

-- La fiesta de la sala de pruebas: en marcha desde ya y durante 30 días.
INSERT INTO public.events (venue_id, name, description, start_date, end_date, latitude, longitude,
                           theme, dress_code, min_age, price, max_capacity, poster_url, recurrence)
SELECT v.id, 'Vybe Test Night',
       'Fiesta permanente para probar la app: entra con el código LAB777 y encontrarás a 35 personas dentro.',
       NOW() - INTERVAL '1 hour', NOW() + INTERVAL '30 days', v.latitude, v.longitude,
       'Techno', 'Libre', 18, 0, 300, {q(lab_poster)}, 'none'
FROM public.venues v
WHERE v.email = 'sala-pruebas@{DOMAIN}'
  AND NOT EXISTS (SELECT 1 FROM public.events x WHERE x.venue_id = v.id AND x.name = 'Vybe Test Night');

-- Códigos de acceso de las fiestas en marcha.
INSERT INTO public.event_codes (venue_id, event_id, code, expires_at, active, kind, label)
SELECT x.venue_id, x.id, e.code, x.end_date, TRUE, 'general', 'Puerta general'
FROM seed_events e
JOIN seed_venues sv ON sv.key = e.venue_key
JOIN public.venues v ON v.email = sv.email
JOIN public.events x ON x.venue_id = v.id AND x.name = e.name
WHERE e.code IS NOT NULL
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.event_codes (venue_id, event_id, code, expires_at, active, kind, label)
SELECT x.venue_id, x.id, 'LAB777', x.end_date, TRUE, 'general', 'Sala de pruebas'
FROM public.events x
JOIN public.venues v ON v.id = x.venue_id
WHERE v.email = 'sala-pruebas@{DOMAIN}' AND x.name = 'Vybe Test Night'
ON CONFLICT (code) DO UPDATE SET active = TRUE, event_id = EXCLUDED.event_id,
    venue_id = EXCLUDED.venue_id, expires_at = EXCLUDED.expires_at;
""")

    # ------------------------------------------------ asistencia e intención
    sql.append(f"""-- Quién está dentro ahora: la gente de la sala de pruebas se queda «vista»
-- hasta que acabe su fiesta; la de las fiestas en marcha, desde ahora.
INSERT INTO public.event_attendance (event_id, profile_id, checked_in_at, last_seen_at,
                                     latitude, longitude, photo_url, photo_taken_at, code_id)
SELECT x.id, p.id,
       NOW() - (((('x' || substr(md5(p.id::text), 1, 2))::bit(8)::int) % 90) || ' minutes')::interval,
       CASE WHEN s.venue_key = 'lab' THEN x.end_date ELSE NOW() END,
       v.latitude + ((('x' || substr(md5(p.id::text), 1, 4))::bit(16)::int % 60) - 30) * 0.000008,
       v.longitude + ((('x' || substr(md5(p.id::text), 5, 4))::bit(16)::int % 60) - 30) * 0.00001,
       s.photo, NOW(),
       (SELECT c.id FROM public.event_codes c WHERE c.event_id = x.id ORDER BY c.created_at LIMIT 1)
FROM seed_people s
JOIN public.profiles p ON p.email = s.email
JOIN seed_venues sv ON sv.key = s.venue_key
JOIN public.venues v ON v.email = sv.email
JOIN LATERAL (
    SELECT e.* FROM public.events e
    WHERE e.venue_id = v.id AND e.start_date <= NOW() AND e.end_date > NOW()
    ORDER BY e.start_date DESC LIMIT 1
) x ON TRUE
ON CONFLICT (event_id, profile_id) DO UPDATE
    SET last_seen_at = EXCLUDED.last_seen_at, photo_url = EXCLUDED.photo_url,
        latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;

-- El perfil, donde está su fiesta: el tablón filtra también por distancia.
UPDATE public.profiles p
SET latitude = ea.latitude, longitude = ea.longitude
FROM public.event_attendance ea
WHERE ea.profile_id = p.id AND p.email LIKE '%@{DOMAIN}' AND ea.latitude IS NOT NULL;

-- Cada persona dice que va a entre dos y cuatro fiestas futuras.
INSERT INTO public.event_intents (event_id, profile_id)
SELECT x.id, p.id
FROM public.profiles p
JOIN public.events x ON x.end_date > NOW() AND x.start_date > NOW()
JOIN public.venues v ON v.id = x.venue_id AND v.email LIKE '%@{DOMAIN}'
WHERE p.email LIKE '%@{DOMAIN}'
  AND (('x' || substr(md5(p.id::text || x.id::text), 1, 2))::bit(8)::int) % 9 < 1
  AND NOT EXISTS (SELECT 1 FROM public.event_intents i WHERE i.event_id = x.id AND i.profile_id = p.id);
""")

    sql.append(f"""DROP TABLE IF EXISTS seed_accounts, seed_people, seed_venues, seed_events;

-- Comprobación
SELECT json_build_object(
    'personas', (SELECT COUNT(*) FROM public.profiles WHERE email LIKE '%@{DOMAIN}'),
    'mujeres', (SELECT COUNT(*) FROM public.profiles WHERE email LIKE '%@{DOMAIN}' AND gender = 'woman'),
    'hombres', (SELECT COUNT(*) FROM public.profiles WHERE email LIKE '%@{DOMAIN}' AND gender = 'man'),
    'locales', (SELECT COUNT(*) FROM public.venues WHERE email LIKE '%@{DOMAIN}'),
    'fiestas', (SELECT COUNT(*) FROM public.events e JOIN public.venues v ON v.id = e.venue_id WHERE v.email LIKE '%@{DOMAIN}'),
    'en_marcha', (SELECT COUNT(*) FROM public.events e JOIN public.venues v ON v.id = e.venue_id WHERE v.email LIKE '%@{DOMAIN}' AND e.start_date <= NOW() AND e.end_date > NOW()),
    'dentro_sala_pruebas', (SELECT COUNT(*) FROM public.event_attendance ea JOIN public.events e ON e.id = ea.event_id JOIN public.venues v ON v.id = e.venue_id WHERE v.email = 'sala-pruebas@{DOMAIN}'),
    'intenciones', (SELECT COUNT(*) FROM public.event_intents i JOIN public.profiles p ON p.id = i.profile_id WHERE p.email LIKE '%@{DOMAIN}')
) AS resultado;
""")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('\n'.join(sql), encoding='utf-8', newline='\n')
    print(f'{OUT} · {OUT.stat().st_size} bytes')


if __name__ == '__main__':
    main()
