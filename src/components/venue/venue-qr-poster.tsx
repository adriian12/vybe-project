import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode.react";
import { Monitor, Printer, X } from "lucide-react";
import { PartyButton } from "@/components/ui-custom/party-button";
import { cn } from "@/lib/utils";

interface VenueQRPosterProps {
  /** Código de acceso que se imprime como QR (el del negocio). */
  code?: string;
  /**
   * O un enlace (la ficha pública de la fiesta): lo que usa administración,
   * sobre todo en las fiestas de Fiestea, que no tienen código de acceso.
   */
  link?: string;
  eventName?: string;
  venueName?: string;
}

type Orientacion = "portrait" | "landscape";
/** Amarillo de la marca, blanco para gastar poca tinta y oscuro para pantallas. */
type Color = "yellow" | "white" | "dark";

/**
 * Cartel con el QR del evento: se imprime para colgarlo en la puerta o se
 * enseña a pantalla completa en una tele del local.
 *
 * Se maqueta en el propio documento y se muestra sólo al imprimir (o en modo
 * pantalla), en lugar de abrir una ventana nueva: los navegadores bloquean las
 * ventanas emergentes y el local se quedaría sin cartel sin saber por qué.
 *
 * `print-poster` en `index.css` es lo que oculta el resto de la página y deja
 * el cartel a página completa. Esa regla oculta todo lo que cuelga de `body`
 * salvo el cartel, así que el cartel **tiene** que colgar de `body`: por eso va
 * en un portal. Dentro de la app se ocultaba con ella y salía la hoja en blanco.
 */
const VenueQRPoster = ({ code, link, eventName, venueName }: VenueQRPosterProps) => {
  const { t } = useTranslation();
  const [orientacion, setOrientacion] = useState<Orientacion>("portrait");
  const [color, setColor] = useState<Color>("yellow");
  const [enPantalla, setEnPantalla] = useState(false);
  const cartel = useRef<HTMLDivElement>(null);

  // Al salir de la pantalla completa con Esc, el cartel también se cierra.
  useEffect(() => {
    if (!enPantalla) return;
    const alSalir = () => {
      if (!document.fullscreenElement) setEnPantalla(false);
    };
    document.addEventListener("fullscreenchange", alSalir);
    return () => document.removeEventListener("fullscreenchange", alSalir);
  }, [enPantalla]);

  const mostrar = () => {
    setEnPantalla(true);
    // En el móvil puede no haber pantalla completa: se queda a toda la ventana.
    window.setTimeout(() => void cartel.current?.requestFullscreen?.().catch(() => undefined), 0);
  };

  const cerrar = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setEnPantalla(false);
  };

  const opcion = (activa: boolean) =>
    cn(
      "press h-8 flex-1 rounded-lg px-2 text-caption font-bold",
      activa ? "bg-ink text-white" : "bg-[#F5F5F7] text-ink",
    );

  return (
    <>
      <div className="space-y-2">
        <div className="flex gap-1.5" role="group" aria-label={t("venue.qr.posterOrientation")}>
          {(["portrait", "landscape"] as const).map((o) => (
            <button key={o} type="button" className={opcion(orientacion === o)} aria-pressed={orientacion === o} onClick={() => setOrientacion(o)}>
              {t(o === "portrait" ? "venue.qr.posterPortrait" : "venue.qr.posterLandscape")}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5" role="group" aria-label={t("venue.qr.posterColor")}>
          {(["yellow", "white", "dark"] as const).map((c) => (
            <button key={c} type="button" className={opcion(color === c)} aria-pressed={color === c} onClick={() => setColor(c)}>
              {t(`venue.qr.posterColors.${c}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <PartyButton
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            // Primero se pinta el clic y luego se abre el diálogo de imprimir, que
            // bloquea la página mientras está abierto.
            onClick={() => window.setTimeout(() => window.print(), 50)}
          >
            <Printer size={16} />
            {t("venue.qr.printPoster")}
          </PartyButton>
          <PartyButton variant="outline" size="sm" className="flex-1 gap-2" onClick={mostrar}>
            <Monitor size={16} />
            {t("venue.qr.showPoster")}
          </PartyButton>
        </div>
      </div>

      {createPortal(
        <div
          ref={cartel}
          className={cn(
            "print-poster",
            `print-poster--${orientacion}`,
            `print-poster--${color}`,
            enPantalla && "print-poster--screen",
          )}
          aria-hidden={!enPantalla}
        >
          {/* La hoja apaisada se pide aquí: `@page` no puede depender de una clase. */}
          {orientacion === "landscape" && (
            <style>{"@media print { @page { size: A4 landscape; margin: 0; } }"}</style>
          )}

          {enPantalla && (
            <button type="button" onClick={cerrar} aria-label={t("common.close")} className="print-poster-close">
              <X size={22} />
            </button>
          )}

          <div className="print-poster-inner">
            <div className="print-poster-top">
              <div className="print-poster-brand">Fiestea</div>
              <div className="print-poster-headline">{t("venue.qr.posterSlogan")}</div>
            </div>

            <div className="print-poster-scan">
              <div className="print-poster-qr">
                {/* Nivel H de corrección de errores: el cartel acabará con marcas
                  de vasos y luz de discoteca, y aun así tiene que leerse. */}
                <QRCode value={link ?? code ?? ''} size={520} level="H" includeMargin renderAs="svg" />
              </div>
              {!link && code && <div className="print-poster-code">{code}</div>}
            </div>

            <div className="print-poster-bottom">
              <div className="print-poster-event">
                {eventName && <div className="print-poster-event-name">{eventName}</div>}
                {venueName && <div className="print-poster-venue">{venueName}</div>}
              </div>
              <div className="print-poster-footer">
                {t(link ? "venue.qr.posterFooterLink" : "venue.qr.posterFooter")}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default VenueQRPoster;
