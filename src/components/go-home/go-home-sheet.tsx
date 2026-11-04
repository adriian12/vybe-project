import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Home, Loader2, MapPin, Pencil, Search, Send, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { FAST_POSITION, getCurrentPosition } from '@/services/geo';
import { openExternal } from '@/services/native';
import { ticketsService } from '@/services/tickets';
import { AddressSuggestion, RouteHome, getHome, routeHome, searchAddress, setHome } from '@/services/ride';
import { CABIFY_LINK, Punto, Rango, precioVtc, uberLink } from '@/lib/ride-fares';
import { CabifyLogo, UberLogo } from './ride-logos';
import { shareOrCopy } from '@/lib/share';
import { track } from '@/lib/observability';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fiesta en la que estás: su sitio sirve de origen si no hay ubicación. */
  eventId?: string | null;
  venueName?: string | null;
}

type Paso = 'opciones' | 'casa' | 'otra';

/**
 * «Volver a casa»: Uber o Cabify con precio aproximado y tiempo, y «Avisar a
 * alguien de que vuelvo». El taxi no sale: se para en la calle. Cada opción
 * abre su app con el destino puesto cuando se puede; el precio final lo da
 * esa app.
 */
const GoHomeSheet: React.FC<Props> = ({ open, onOpenChange, eventId, venueName }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [paso, setPaso] = useState<Paso>('opciones');
  const [casa, setCasa] = useState<string | null>(getHome);
  /** «Otra dirección»: sólo para esta vez, no se guarda. */
  const [destino, setDestino] = useState<string | null>(null);
  const [origen, setOrigen] = useState<Punto | null>(null);
  /** Mientras se busca de dónde sales: la hoja dice «calculando», no «sin precio». */
  const [buscandoOrigen, setBuscandoOrigen] = useState(true);
  const [ruta, setRuta] = useState<RouteHome | null>(null);
  const [calculando, setCalculando] = useState(false);

  const [q, setQ] = useState('');
  const [sugerencias, setSugerencias] = useState<AddressSuggestion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const espera = useRef<number | null>(null);

  const adonde = destino ?? casa;

  // Al abrir: sin casa guardada, se pide; con casa, a las opciones.
  useEffect(() => {
    if (!open) return;
    setPaso(getHome() ? 'opciones' : 'casa');
    setDestino(null);
    setQ('');
    setSugerencias([]);
  }, [open]);

  // El origen. Dentro de una fiesta vale su sitio, que llega al momento; si
  // no, la ubicación, con 8 s como mucho (en un local cerrado el GPS puede no
  // contestar nunca).
  useEffect(() => {
    if (!open || origen) return;
    let vivo = true;
    setBuscandoOrigen(true);
    void (async () => {
      if (eventId) {
        const evento = await ticketsService.getPublicEvent(eventId).catch(() => null);
        if (vivo && evento?.latitude != null && evento.longitude != null) {
          setOrigen({ lat: evento.latitude, lng: evento.longitude });
          setBuscandoOrigen(false);
          return;
        }
      }
      try {
        const p = await Promise.race([
          getCurrentPosition(FAST_POSITION),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 8000)),
        ]);
        if (vivo) setOrigen({ lat: p.latitude, lng: p.longitude });
      } catch {
        // Sin ubicación: los botones abren la app igual, sin precio.
      } finally {
        if (vivo) setBuscandoOrigen(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [open, origen, eventId]);

  // El trayecto, en cuanto hay origen y destino.
  useEffect(() => {
    if (!open || !origen || !adonde) return;
    let vivo = true;
    setCalculando(true);
    void routeHome(origen, adonde)
      .then((r) => vivo && setRuta(r))
      .finally(() => vivo && setCalculando(false));
    return () => {
      vivo = false;
    };
  }, [open, origen, adonde]);

  // El buscador, sin una petición por letra.
  useEffect(() => {
    if (espera.current) window.clearTimeout(espera.current);
    const texto = q.trim();
    if (texto.length < 3) {
      setSugerencias([]);
      return;
    }
    espera.current = window.setTimeout(() => {
      setBuscando(true);
      searchAddress(texto, origen)
        .then(setSugerencias)
        .catch(() => setSugerencias([]))
        .finally(() => setBuscando(false));
    }, 450);
  }, [q, origen]);

  const elegir = (s: AddressSuggestion) => {
    setRuta(null);
    if (paso === 'otra') {
      setDestino(s.full);
    } else {
      setHome(s.full);
      setCasa(s.full);
      setDestino(null);
    }
    setQ('');
    setSugerencias([]);
    setPaso('opciones');
  };

  const borrarCasa = () => {
    setHome(null);
    setCasa(null);
    setRuta(null);
    setPaso('casa');
  };

  const abrir = (app: 'uber' | 'cabify', url: string) => {
    track('go_home_opened', { app, priced: Boolean(ruta) });
    void openExternal(url, { system: true });
  };

  const avisar = async () => {
    const llegada = ruta ? new Date(Date.now() + (ruta.minutes + 10) * 60_000) : null;
    const hora = llegada?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const resultado = await shareOrCopy({
      title: t('goHome.title'),
      text: hora
        ? t('goHome.shareTextEta', { venue: venueName || t('goHome.theParty'), time: hora })
        : t('goHome.shareText', { venue: venueName || t('goHome.theParty') }),
    });
    if (resultado === 'copied') toast({ title: t('goHome.copied') });
  };

  const ahora = new Date();
  const euros = (r: Rango) => t('goHome.price', { min: r.min, max: r.max });
  const esperando = calculando || (buscandoOrigen && !origen);
  const opciones: { id: 'uber' | 'cabify'; nombre: string; Logo: () => JSX.Element; precio: Rango | null; url: string }[] = [
    {
      id: 'uber',
      Logo: UberLogo,
      nombre: 'Uber',
      precio: ruta ? precioVtc('uber', ruta.km, ruta.minutes, ahora) : null,
      url: ruta
        ? uberLink({ ...ruta.to, label: destino ? undefined : t('goHome.home') })
        : 'https://m.uber.com/ul/?action=setPickup&pickup=my_location',
    },
    {
      id: 'cabify',
      nombre: 'Cabify',
      Logo: CabifyLogo,
      precio: ruta ? precioVtc('cabify', ruta.km, ruta.minutes, ahora) : null,
      url: CABIFY_LINK,
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="pb-safe max-h-[88vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Home size={18} className="text-party-primary" />
            {paso === 'opciones' ? t('goHome.title') : paso === 'casa' ? t('goHome.setHome') : t('goHome.otherAddress')}
          </SheetTitle>
          <SheetDescription>
            {paso === 'opciones' ? t('goHome.subtitle') : t('goHome.homePrivacy')}
          </SheetDescription>
        </SheetHeader>

        {paso === 'opciones' ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 rounded-xl bg-surface-low p-3">
              <MapPin size={16} className="shrink-0 text-party-primary" />
              <span className="min-w-0 flex-1 truncate text-body-sm">{adonde}</span>
              <button
                type="button"
                onClick={() => setPaso('casa')}
                aria-label={t('goHome.changeHome')}
                className="press rounded-lg p-1.5 text-party-gray hover:text-foreground"
              >
                <Pencil size={15} />
              </button>
            </div>

            <ul className="space-y-2">
              {opciones.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => abrir(o.id, o.url)}
                    className="press flex w-full items-center gap-3 rounded-2xl bg-surface-container p-4 text-left hover:bg-surface-high"
                  >
                    <o.Logo />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-title-card">{o.nombre}</span>
                      <span className="block text-body-sm text-party-gray">
                        {esperando ? (
                          <Loader2 size={13} className="inline animate-spin" />
                        ) : o.precio && ruta ? (
                          <>
                            <span className="font-bold text-foreground">{euros(o.precio)}</span>
                            {' · '}
                            {t('goHome.minutes', { count: ruta.minutes })}
                          </>
                        ) : (
                          t('goHome.openApp')
                        )}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-party-gray" />
                  </button>
                </li>
              ))}
            </ul>

            <p className="text-caption text-party-gray">
              {ruta ? t('goHome.approx') : !esperando ? t('goHome.noPrice') : null}
            </p>

            <button
              type="button"
              onClick={() => void avisar()}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-bold text-ink"
            >
              <Send size={16} />
              {t('goHome.tellSomeone')}
            </button>

            <button
              type="button"
              onClick={() => setPaso('otra')}
              className="press h-10 w-full text-body-sm font-semibold text-party-gray hover:text-foreground"
            >
              {t('goHome.otherAddress')}
            </button>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-party-gray" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('goHome.searchPlaceholder')}
                aria-label={t('goHome.searchPlaceholder')}
                className="pl-9"
              />
              {buscando && (
                <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-party-gray" />
              )}
            </div>

            <ul className="space-y-1">
              {sugerencias.map((s) => (
                <li key={s.full}>
                  <button
                    type="button"
                    onClick={() => elegir(s)}
                    className="press flex w-full items-start gap-3 rounded-xl p-2.5 text-left hover:bg-surface-low"
                  >
                    <MapPin size={16} className="mt-0.5 shrink-0 text-party-primary" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.label}</span>
                      <span className="block truncate text-caption text-party-gray">{s.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {casa && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaso('opciones')}
                  className="press h-10 flex-1 rounded-xl border border-white/15 text-body-sm font-semibold"
                >
                  {t('goHome.back')}
                </button>
                {paso === 'casa' && (
                  <button
                    type="button"
                    onClick={borrarCasa}
                    className="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-body-sm font-semibold text-destructive"
                  >
                    <Trash2 size={14} />
                    {t('goHome.deleteHome')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default GoHomeSheet;
