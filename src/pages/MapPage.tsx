import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronRight, LocateFixed, Music, Navigation, Search, SlidersHorizontal, X } from 'lucide-react';
import Header from '@/components/header';
import Footer from '@/components/footer';
import { DARK_TILES, HAS_MAP_TILES, TILES_ATTRIBUTION } from '@/components/map-thumb';
import { dayAndMonth } from '@/components/event-bits';
import { vibeKey } from '@/lib/vibe';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppContext } from '@/context/app-context';
import { EventWithDistance, isEventLive, isEventTonight, useEventsFeed } from '@/hooks/use-events-feed';
import { DateFilter } from '@/components/party-filters';
import { matchesDate, nightOf, useDateSelection } from '@/lib/date-filter';
import { formatDistance } from '@/services/geo';
import { cn } from '@/lib/utils';
import { VenueType } from '@/types/venue';
import { featuredFirst, isFeatured } from '@/lib/featured';
import MapFiltersSheet from '@/components/map-filters-sheet';
import { aplicarFiltros, Franja } from '@/lib/party-filters';

/** Centro por defecto: Palma, cuando no hay ubicación ni eventos con punto. */
const PALMA: L.LatLngTuple = [39.5696, 2.6502];

const NOTA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111114" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * El alfiler del mapa: círculo amarillo con una nota. El seleccionado crece,
 * lleva anillo blanco y el nombre del local encima.
 *
 * Es HTML dentro de un `divIcon` y no una imagen, así que se pinta con los
 * mismos colores que el resto de la aplicación y no hay que empaquetar los
 * iconos de Leaflet, que con Vite se rompen.
 */
/** Llama naranja para los eventos destacados: «evento caliente». */
const FUEGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#FF6A2B" stroke="#111114" stroke-width="1.6" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';

const icono = (nombre: string, seleccionado: boolean, directo: boolean, destacado: boolean) =>
  L.divIcon({
    className: 'vybe-pin',
    iconSize: seleccionado ? [160, 76] : [32, 38],
    iconAnchor: seleccionado ? [80, 76] : [16, 38],
    html: seleccionado
      ? `<div class="vybe-pin-selected">
           <span class="vybe-pin-label">${directo ? '<i></i>' : ''}${escapar(nombre)}</span>
           <span class="vybe-pin-ring">${destacado ? `<span class="vybe-pin-fire">${FUEGO}</span>` : ''}<span class="vybe-pin-dot${destacado ? ' vybe-pin-dot-hot' : ''}">${NOTA}</span></span>
         </div>`
      : `<div class="vybe-pin-simple">${destacado ? `<span class="vybe-pin-fire">${FUEGO}</span>` : ''}<span class="vybe-pin-dot${destacado ? ' vybe-pin-dot-hot' : ''}">${NOTA}</span></div>`,
  });

const TIPOS: VenueType[] = ['discoteca', 'bar', 'festival', 'fiesta_privada', 'evento_empresarial', 'local'];

/**
 * El mapa de eventos cerca, según «Mapa de Eventos Cerca» de Stitch.
 *
 * Es la pantalla que no existía. Aquí vive también la búsqueda (fiestas, salas
 * o zonas), que es donde la pone el diseño, y la hoja de abajo con los eventos
 * del área visible.
 */
const MapPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeEvent } = useAppContext();
  const { withDistance, position, activity } = useEventsFeed();

  const contenedor = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const yo = useRef<L.Marker | null>(null);
  const encuadrado = useRef(false);
  const tarjetas = useRef<Record<string, HTMLElement | null>>({});

  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState<VenueType | null>(null);
  const [soloDirecto, setSoloDirecto] = useState(false);
  // La fecha es la misma que en inicio (por defecto, hoy).
  const fecha = useDateSelection();
  const [soloGratis, setSoloGratis] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [lista, setLista] = useState(false);
  const [theme, setTheme] = useState<string | null>(null);
  const [franja, setFranja] = useState<Franja | null>(null);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  // «¿Dónde seguimos?»: con `?desde=<hora>` sólo salen las fiestas abiertas
  // después de esa hora (las que siguen en marcha o empiezan poco después).
  const [params, setParams] = useSearchParams();
  const desde = useMemo(() => {
    const valor = params.get('desde');
    const fecha = valor ? new Date(valor) : null;
    return fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;
  }, [params]);

  const conPunto = useMemo(() => withDistance.filter(({ event }) => event.location), [withDistance]);
  const noches = useMemo(() => [...new Set(conPunto.map(({ event }) => nightOf(event.startDate)))], [conPunto]);

  const tiposPresentes = useMemo(
    () => TIPOS.filter((tp) => conPunto.some(({ event }) => event.venueType === tp)),
    [conPunto],
  );

  const visibles = useMemo<EventWithDistance[]>(() => {
    const q = busqueda
      .trim()
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    return featuredFirst(aplicarFiltros(conPunto, theme, franja).filter(({ event }) => {
      if (tipo && event.venueType !== tipo) return false;
      if (soloDirecto && !isEventLive(event)) return false;
      if (!matchesDate(event, fecha)) return false;
      if (soloGratis && (event.price ?? 0) > 0) return false;
      if (
        desde &&
        (new Date(event.endDate).getTime() <= desde.getTime() + 30 * 60_000 ||
          new Date(event.startDate).getTime() > desde.getTime() + 2 * 60 * 60_000)
      ) {
        return false;
      }
      if (!q) return true;
      const texto = [event.name, event.venueName, event.city, event.region, event.theme]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '');
      return texto.includes(q);
    }));
  }, [conPunto, busqueda, tipo, soloDirecto, fecha, soloGratis, desde, theme, franja]);

  const temasMapa = useMemo(() => {
    const encontrados = new Set<string>();
    for (const { event } of conPunto) if (event.theme) encontrados.add(event.theme);
    return [...encontrados].sort();
  }, [conPunto]);

  // --------------------------------------------------------------- el mapa
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    // La atribución de los datos del mapa se escribe al pie de la hoja de
    // abajo: el control de Leaflet quedaba tapado por ella.
    const m = L.map(contenedor.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(PALMA, 12);

    // Sin clave de CARTO cada tesela sería una marca de agua: mejor el fondo solo.
    if (HAS_MAP_TILES) {
      L.tileLayer(DARK_TILES, {
        subdomains: 'abcd',
        maxZoom: 19,
        detectRetina: true,
      }).addTo(m);
    }

    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    // Tocar el mapa fuera de un alfiler cierra la tarjeta.
    m.on('click', () => setSeleccion(null));

    return () => {
      m.remove();
      mapa.current = null;
      capa.current = null;
      yo.current = null;
    };
  }, []);

  // Tu posición, en el cian del sistema de diseño: es lo único que no es un
  // evento y no debe confundirse con un alfiler amarillo.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !position) return;

    const punto: L.LatLngTuple = [position.latitude, position.longitude];
    if (yo.current) {
      yo.current.setLatLng(punto);
    } else {
      yo.current = L.marker(punto, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: 'vybe-pin',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          html: '<div class="vybe-me"><span></span><i></i></div>',
        }),
      }).addTo(m);
    }
  }, [position]);

  // Alfileres.
  useEffect(() => {
    const grupo = capa.current;
    if (!grupo) return;
    grupo.clearLayers();

    for (const { event } of visibles) {
      if (!event.location) continue;
      const seleccionado = event.id === seleccion;
      const marker = L.marker([event.location.latitude, event.location.longitude], {
        icon: icono(event.venueName ?? event.name, seleccionado, isEventLive(event), isFeatured(event)),
        zIndexOffset: seleccionado ? 1000 : isFeatured(event) ? 500 : 0,
        title: event.name,
      });
      // Tocar un alfiler enseña su tarjeta abajo; tocar la tarjeta abre el evento.
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        setSeleccion(event.id);
        tarjetas.current[event.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });
      grupo.addLayer(marker);
    }
  }, [visibles, seleccion]);

  // Encuadre inicial: todos los eventos y tú, una sola vez. Después manda la
  // persona, que puede estar mirando otra zona a propósito.
  useEffect(() => {
    const m = mapa.current;
    if (!m || encuadrado.current || conPunto.length === 0) return;

    const puntos: L.LatLngTuple[] = conPunto.map(({ event }) => [
      event.location!.latitude,
      event.location!.longitude,
    ]);
    if (position) puntos.push([position.latitude, position.longitude]);

    m.fitBounds(L.latLngBounds(puntos), { padding: [48, 48], maxZoom: 15 });
    encuadrado.current = true;
  }, [conPunto, position]);

  const centrarEnMi = () => {
    if (position) mapa.current?.flyTo([position.latitude, position.longitude], 15, { duration: 0.6 });
  };

  const seleccionar = (item: EventWithDistance) => {
    setSeleccion(item.event.id);
    if (item.event.location) {
      mapa.current?.flyTo([item.event.location.latitude, item.event.location.longitude], 15, {
        duration: 0.5,
      });
    }
  };

  const abrir = (id: string) =>
    navigate(activeEvent?.eventId === id ? `/event/${id}/live` : `/event/${id}`);

  const filtrosActivos = [soloDirecto, soloGratis, tipo !== null, theme !== null, franja !== null].filter(
    Boolean,
  ).length;
  const cercanos = visibles.filter((e) => e.distance !== null && e.distance <= 10_000).length;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden pt-[var(--header-h)]">
      <Header />

      <main className="relative flex-1 overflow-hidden pb-[var(--nav-h)]">
        <div ref={contenedor} className="absolute inset-0 bottom-[var(--nav-h)] z-0 bg-[#0E0E11]" />

        {/* -------------------------------------------- buscador y filtros */}
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] mx-auto flex max-w-2xl flex-col gap-2 px-margin">
          <div className="pointer-events-auto flex items-center gap-2">
            <label className="relative flex h-12 flex-1 items-center rounded-full bg-[#E4E1E6] px-4 shadow-lg shadow-black/30">
              <Search size={20} className="mr-2 shrink-0 text-[#554600]" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t('map.searchPlaceholder')}
                aria-label={t('map.searchPlaceholder')}
                className="w-full truncate bg-transparent text-body-md text-ink outline-none placeholder:font-normal placeholder:text-[#6B6A6E] [&::-webkit-search-cancel-button]:hidden"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label={t('common.close')}
                  className="press ml-1 shrink-0 text-ink/60"
                >
                  <X size={18} />
                </button>
              )}
            </label>

            <button
              type="button"
              onClick={() => setFiltrosAbiertos(true)}
              aria-label={t('map.filters')}
              className="press relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink shadow-lg shadow-black/40"
            >
              <SlidersHorizontal size={22} />
              {filtrosActivos > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-party-primary">
                  {filtrosActivos}
                </span>
              )}
            </button>
          </div>

          <div className="pointer-events-auto flex">
            <DateFilter nights={noches} className="shadow-lg shadow-black/30" />
          </div>

          {desde && (
            <button
              type="button"
              onClick={() => setParams({}, { replace: true })}
              className="press pointer-events-auto flex h-9 w-fit items-center gap-2 rounded-full bg-party-primary px-4 text-label-pill text-ink shadow-md"
            >
              {t('map.openAfter', {
                time: desde.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
              })}
              <X size={15} />
            </button>
          )}

        </div>

        <MapFiltersSheet
          open={filtrosAbiertos}
          onOpenChange={setFiltrosAbiertos}
          venueTypes={tiposPresentes}
          venueType={tipo}
          onVenueType={setTipo}
          franja={franja}
          onFranja={setFranja}
          themes={temasMapa}
          theme={theme}
          onTheme={setTheme}
          live={soloDirecto}
          onLive={setSoloDirecto}
          free={soloGratis}
          onFree={setSoloGratis}
          results={visibles.length}
          onReset={() => {
            setTipo(null);
            setTheme(null);
            setFranja(null);
            setSoloDirecto(false);
            setSoloGratis(false);
          }}
        />

        {/* ------------------------------------------------- centrar en mí */}
        {position && (
          <button
            type="button"
            onClick={centrarEnMi}
            aria-label={t('map.recenter')}
            className={cn(
              'press absolute right-margin z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-surface-high/90 text-foreground shadow-xl backdrop-blur-md',
              lista ? 'hidden' : 'bottom-[calc(var(--nav-h)+13rem)]',
            )}
          >
            <LocateFixed size={20} />
          </button>
        )}

        {/* ------------------------------------------------- hoja de abajo */}
        <section
          aria-label={t('map.nearby')}
          className={cn(
            'absolute inset-x-0 bottom-[var(--nav-h)] z-[600] mx-auto flex max-w-2xl flex-col gap-2 rounded-t-[24px] bg-[#0E0E11] px-margin pb-3 pt-2.5 shadow-[0_-8px_30px_rgba(0,0,0,0.7)] transition-[max-height] duration-300 [transition-timing-function:var(--ease-drawer)]',
            lista ? 'max-h-[calc(100%-5rem)]' : 'max-h-[13rem]',
          )}
        >
          <button
            type="button"
            onClick={() => setLista((v) => !v)}
            aria-label={lista ? t('map.showMap') : t('map.showList')}
            className="mx-auto h-1 w-10 shrink-0 rounded-full bg-surface-highest"
          />

          <div className="flex shrink-0 items-center justify-between pt-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-display text-title-card">
                {busqueda ? t('map.results') : t('map.nearby')}
              </span>
              <span className="shrink-0 rounded-full bg-surface-high px-2 py-0.5 text-caption text-[#FFEFBC]">
                {position ? t('map.nearCount', { count: cercanos }) : t('map.count', { count: visibles.length })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLista((v) => !v)}
              className="shrink-0 text-caption text-[#C8C6C5] hover:text-party-primary"
            >
              {lista ? t('map.showMap') : t('map.showList')}
            </button>
          </div>

          {visibles.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-party-gray">{t('map.empty')}</p>
          ) : !lista && !seleccion ? (
            <p className="pb-1 text-caption text-party-gray">{t('map.tapPin')}</p>
          ) : (
            <div className="no-scrollbar -mx-margin flex-1 space-y-2 overflow-y-auto px-margin pb-1">
              {/* Al abrir el mapa sólo se ve el mapa: la tarjeta sale al tocar un
                  alfiler, y la lista entera con «Ver lista». */}
              {(lista ? visibles : visibles.filter((item) => item.event.id === seleccion)).map((item) => {
                const { event, distance } = item;
                const activa = event.id === seleccion;
                const directo = isEventLive(event);
                const hoy = isEventTonight(event);
                const cifras = activity[event.id];
                const { weekday, day } = dayAndMonth(event.startDate);

                return (
                  <article
                    key={event.id}
                    ref={(el) => {
                      tarjetas.current[event.id] = el;
                    }}
                    onClick={() => (activa || !lista ? abrir(event.id) : seleccionar(item))}
                    className={cn(
                      'press flex w-full cursor-pointer items-center gap-3 rounded-2xl p-2',
                      activa ? 'bg-[#E4E1E6] text-ink shadow-xl' : 'bg-surface-container text-foreground',
                    )}
                  >
                    <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-surface-highest">
                      {event.posterUrl ? (
                        <img src={event.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-party-primary/50">
                          <Music size={26} />
                        </span>
                      )}
                      <span
                        className={cn(
                          'absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-tight',
                          directo || hoy ? 'bg-party-primary text-ink' : 'bg-surface-highest text-foreground',
                        )}
                      >
                        {directo || hoy ? t('map.today') : `${weekday} ${day}`}
                      </span>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      <h3 className="truncate font-display text-title-card">{event.name}</h3>
                      <p className={cn('mt-0.5 truncate text-body-sm', activa ? 'text-[#554600]' : 'text-[#C8C6C5]')}>
                        {event.venueName}
                        {event.city ? ` · ${event.city}` : ''}
                      </p>
                      <div
                        className={cn(
                          'mt-1.5 flex items-center gap-2 text-caption',
                          activa ? 'text-ink' : 'text-[#C8C6C5]',
                        )}
                      >
                        {distance !== null && (
                          <span className="flex items-center gap-0.5">
                            <Navigation size={13} className={activa ? 'text-[#6C5900]' : ''} />
                            {formatDistance(distance)}
                          </span>
                        )}
                        {cifras?.vibeLevel ? (
                          <span className="font-bold">· {t(vibeKey(cifras.vibeLevel))}</span>
                        ) : cifras?.inside ? (
                          <span className="font-bold">· {t('home.inside', { count: cifras.inside })}</span>
                        ) : cifras?.going ? (
                          <span>· {t('map.going', { count: cifras.going })}</span>
                        ) : null}
                      </div>
                    </div>

                    {activa ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrir(event.id);
                        }}
                        className="press flex h-9 shrink-0 items-center rounded-xl bg-party-primary px-3 font-display text-[13px] uppercase tracking-wider text-ink shadow-md"
                      >
                        {t('map.view')}
                      </button>
                    ) : (
                      <ChevronRight size={20} className="shrink-0 text-[#C8C6C5]" />
                    )}
                  </article>
                );
              })}
            </div>
          )}

        </section>
      </main>

      <Footer />
    </div>
  );
};

export default MapPage;
