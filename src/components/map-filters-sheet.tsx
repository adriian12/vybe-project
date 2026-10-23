import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PartyButton } from '@/components/ui-custom/party-button';
import { FRANJAS, Franja } from '@/lib/party-filters';
import { TILES_ATTRIBUTION } from '@/components/map-thumb';
import type { PlaceType } from '@/types/venue';
import { cn } from '@/lib/utils';

interface MapFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tipos de local que hay entre los eventos cargados. */
  venueTypes: PlaceType[];
  venueType: PlaceType | null;
  onVenueType: (value: PlaceType | null) => void;
  franja: Franja | null;
  onFranja: (value: Franja | null) => void;
  /** Géneros musicales presentes. */
  themes: string[];
  theme: string | null;
  onTheme: (value: string | null) => void;
  live: boolean;
  onLive: (value: boolean) => void;
  free: boolean;
  onFree: (value: boolean) => void;
  /** «Con Flechazo» (en directo y con el tablón encendido). Sin `onFlechazo` no sale. */
  flechazo?: boolean;
  onFlechazo?: (value: boolean) => void;
  /** Cuántos eventos quedan con lo elegido. */
  results: number;
  onReset: () => void;
}

/**
 * Todos los filtros del mapa en una hoja: estado, tipo de local, franja y
 * música.
 *
 * Antes estaban repartidos entre un menú pequeño y dos filas de píldoras
 * encima del mapa, que tapaban el mapa y no cabían. Ahora el botón de al lado
 * del buscador los abre todos.
 */
const MapFiltersSheet = ({
  open,
  onOpenChange,
  venueTypes,
  venueType,
  onVenueType,
  franja,
  onFranja,
  themes,
  theme,
  onTheme,
  live,
  onLive,
  free,
  onFree,
  flechazo = false,
  onFlechazo,
  results,
  onReset,
}: MapFiltersSheetProps) => {
  const { t } = useTranslation();

  const pill = (activa: boolean) =>
    cn(
      'press flex h-10 items-center gap-1.5 rounded-full px-4 text-label-pill tracking-wide transition-colors',
      activa ? 'bg-party-primary text-ink shadow-sm' : 'bg-surface-low text-foreground',
    );

  const bloque = (titulo: string, contenido: React.ReactNode) => (
    <section className="space-y-2">
      <h3 className="text-caption uppercase tracking-widest text-party-gray">{titulo}</h3>
      <div className="flex flex-wrap gap-2">{contenido}</div>
    </section>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* En columna: lo de arriba se desplaza y el pie se queda abajo del
          todo. Con el pie `sticky` y la atribución detrás, el pie quedaba a
          media hoja y los géneros pasaban por debajo. */}
      {/* A pantalla completa, como el calendario: se ve todo sin desplazar. */}
      <SheetContent
        side="bottom"
        className="flex h-[100dvh] max-h-[100dvh] flex-col gap-0 rounded-none p-0"
        closeClassName="top-[calc(env(safe-area-inset-top,0px)+1rem)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)]">
        <SheetHeader className="text-left">
          <SheetTitle>{t('map.filters')}</SheetTitle>
          <SheetDescription>{t('map.filtersHelp')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* En directo, gratis y Flechazo: una sola fila y sin título. */}
          <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6">
            <button type="button" onClick={() => onLive(!live)} aria-pressed={live} className={cn(pill(live), 'shrink-0')}>
              {live && <Check size={14} />}
              {t('map.liveOnly')}
            </button>
            <button type="button" onClick={() => onFree(!free)} aria-pressed={free} className={cn(pill(free), 'shrink-0')}>
              {free && <Check size={14} />}
              {t('map.freeOnly')}
            </button>
            {onFlechazo && (
              <button
                type="button"
                onClick={() => onFlechazo(!flechazo)}
                aria-pressed={flechazo}
                className={cn(pill(flechazo), 'shrink-0')}
              >
                {flechazo && <Check size={14} />}
                {t('filters.flechazo')}
              </button>
            )}
          </div>

          {bloque(
            t('map.partyType'),
            FRANJAS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onFranja(franja === f ? null : f)}
                aria-pressed={franja === f}
                className={pill(franja === f)}
              >
                {franja === f && <Check size={14} />}
                {t(`filters.franjas.${f}`)}
              </button>
            )),
          )}

          {venueTypes.length > 0 &&
            bloque(
              t('map.venueType'),
              [null, ...venueTypes].map((tp) => (
                <button
                  key={tp ?? '__todos__'}
                  type="button"
                  onClick={() => onVenueType(tp)}
                  aria-pressed={venueType === tp}
                  className={pill(venueType === tp)}
                >
                  {venueType === tp && <Check size={14} />}
                  {tp ? t(`map.placeTypes.${tp}`) : t('map.all')}
                </button>
              )),
            )}

          {bloque(
            t('filters.music'),
            themes.length > 0 ? (
              [null, ...themes].map((nombre) => (
                <button
                  key={nombre ?? '__todas__'}
                  type="button"
                  onClick={() => onTheme(nombre)}
                  aria-pressed={theme === nombre}
                  className={pill(theme === nombre)}
                >
                  {theme === nombre && <Check size={14} />}
                  {nombre ? t(`filters.musicas.${nombre}`) : t('home.allThemes')}
                </button>
              ))
            ) : (
              <p className="text-body-sm text-party-gray">{t('filters.noMusic')}</p>
            ),
          )}
        </div>

        {/* La atribución de OpenStreetMap y CARTO es obligatoria. */}
        <p
          className="pb-4 text-[10px] leading-snug text-party-gray/80 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: TILES_ATTRIBUTION }}
        />
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-white/10 bg-card px-6 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3">
          <button type="button" onClick={onReset} className="press h-11 shrink-0 px-2 text-body-sm text-party-gray">
            {t('filters.reset')}
          </button>
          <PartyButton className="flex-1" onClick={() => onOpenChange(false)}>
            {t('map.showResults', { count: results })}
          </PartyButton>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MapFiltersSheet;
