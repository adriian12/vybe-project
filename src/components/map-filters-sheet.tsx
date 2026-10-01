import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PartyButton } from '@/components/ui-custom/party-button';
import { FRANJAS, Franja } from '@/lib/party-filters';
import { TILES_ATTRIBUTION } from '@/components/map-thumb';
import type { VenueType } from '@/types/venue';
import { cn } from '@/lib/utils';

interface MapFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tipos de local que hay entre los eventos cargados. */
  venueTypes: VenueType[];
  venueType: VenueType | null;
  onVenueType: (value: VenueType | null) => void;
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
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t('map.filters')}</SheetTitle>
          <SheetDescription>{t('map.filtersHelp')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {bloque(
            t('map.when'),
            <>
              <button type="button" onClick={() => onLive(!live)} aria-pressed={live} className={pill(live)}>
                {live && <Check size={14} />}
                {t('map.liveOnly')}
              </button>
              <button type="button" onClick={() => onFree(!free)} aria-pressed={free} className={pill(free)}>
                {free && <Check size={14} />}
                {t('map.freeOnly')}
              </button>
            </>,
          )}

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
                  {tp ? t(`venueTypes.${tp}`) : t('map.all')}
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
                  {nombre ?? t('home.allThemes')}
                </button>
              ))
            ) : (
              <p className="text-body-sm text-party-gray">{t('filters.noMusic')}</p>
            ),
          )}
        </div>

        <div className="sticky bottom-0 -mx-6 flex items-center gap-2 border-t border-white/10 bg-card px-6 py-3">
          <button type="button" onClick={onReset} className="press h-11 shrink-0 px-2 text-body-sm text-party-gray">
            {t('filters.reset')}
          </button>
          <PartyButton className="flex-1" onClick={() => onOpenChange(false)}>
            {t('map.showResults', { count: results })}
          </PartyButton>
        </div>

        {/* La atribución de OpenStreetMap y CARTO es obligatoria. */}
        <p
          className="pb-2 text-[10px] leading-snug text-party-gray/80 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: TILES_ATTRIBUTION }}
        />
      </SheetContent>
    </Sheet>
  );
};

export default MapFiltersSheet;
