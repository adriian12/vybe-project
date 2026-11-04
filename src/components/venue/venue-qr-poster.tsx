import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode.react";
import { Calendar, Check, MapPin, Monitor, Printer, X } from "lucide-react";
import { PartyButton } from "@/components/ui-custom/party-button";
import { VybeMark } from "@/components/brand/vybe-logo";
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
  /** Inicio de la fiesta (ISO): sale en el cartel con día y hora. */
  eventDate?: string;
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
 *
 * Va con `memo`: el panel del QR se repinta cada segundo (la cuenta atrás) y
 * con él se rehacía este cartel entero, QR incluido. Eso era lo que hacía
 * que los botones de orientación y color tardaran en responder.
 */
const VenueQRPoster = ({ code, link, eventName, venueName, eventDate }: VenueQRPosterProps) => {
  const { t, i18n } = useTranslation();
  const [orientacion, setOrientacion] = useState<Orientacion>("portrait");
  const [color, setColor] = useState<Color>("yellow");
  const [enPantalla, setEnPantalla] = useState(false);
  const cartel = useRef<HTMLDivElement>(null);
  const valor = link ?? code ?? "";

  // Al salir de la pantalla completa con Esc, el cartel también se cierra.
  useEffect(() => {
    if (!enPantalla) return;
    const alSalir = () => {
      if (!document.fullscreenElement) setEnPantalla(false);
    };
    document.addEventListener("fullscreenchange", alSalir);
    return () => document.removeEventListener("fullscreenchange", alSalir);
  }, [enPantalla]);

  // El QR sólo cambia con el código: cambiar de color u orientación no lo rehace.
  // Nivel H de corrección de errores: el cartel acabará con marcas de vasos y
  // luz de discoteca, y aun así tiene que leerse (también con el logo encima).
  const qr = useMemo(
    () => <QRCode value={valor} size={520} level="H" includeMargin={false} renderAs="svg" />,
    [valor],
  );

  const fecha = useMemo(() => {
    if (!eventDate) return null;
    const d = new Date(eventDate);
    if (Number.isNaN(d.getTime())) return null;
    const dia = d.toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
    const hora = d.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
    return `${dia} · ${hora}`;
  }, [eventDate, i18n.language]);

  const pasos = link
    ? [t("venue.qr.posterStepsLink.camera"), t("venue.qr.posterStepsLink.open"), t("venue.qr.posterStepsLink.ticket")]
    : [t("venue.qr.posterSteps.open"), t("venue.qr.posterSteps.scan"), t("venue.qr.posterSteps.meet")];

  const mostrar = () => {
    setEnPantalla(true);
    // En el móvil puede no haber pantalla completa: se queda a toda la ventana.
    window.setTimeout(() => void cartel.current?.requestFullscreen?.().catch(() => undefined), 0);
  };

  const cerrar = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setEnPantalla(false);
  };

  // Un selector de dos o tres opciones. La elegida, en amarillo con un ✓; las
  // demás, sólo con borde. Antes la elegida iba en negro y, sobre el fondo
  // oscuro del panel, no se distinguía de las demás. Sirve en claro y oscuro.
  const opcion = (activa: boolean) =>
    cn(
      "press flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-caption font-bold leading-tight",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-party-primary focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
      activa ? "bg-party-primary text-ink shadow-sm" : "border border-party-gray/40 bg-transparent opacity-80 hover:opacity-100",
    );

  const grupo = (etiqueta: string, children: React.ReactNode) => (
    <div className="flex gap-1.5" role="group" aria-label={etiqueta}>
      {children}
    </div>
  );

  return (
    <>
      <div className="space-y-2">
        {grupo(
          t("venue.qr.posterOrientation"),
          (["portrait", "landscape"] as const).map((o) => (
            <button key={o} type="button" className={opcion(orientacion === o)} aria-pressed={orientacion === o} onClick={() => setOrientacion(o)}>
              {orientacion === o && <Check size={13} strokeWidth={3} className="shrink-0" />}
              <span className="truncate">{t(o === "portrait" ? "venue.qr.posterPortrait" : "venue.qr.posterLandscape")}</span>
            </button>
          )),
        )}
        {grupo(
          t("venue.qr.posterColor"),
          (["yellow", "white", "dark"] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={opcion(color === c)}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              title={t(`venue.qr.posterColors.${c}`)}
            >
              <span
                aria-hidden
                className={cn(
                  "h-3 w-3 shrink-0 rounded-full border border-black/25",
                  c === "yellow" && "bg-[#F8D000]",
                  c === "white" && "bg-white",
                  c === "dark" && "bg-[#141414]",
                )}
              />
              <span className="truncate">{t(`venue.qr.posterColors.${c}`).replace(/\s*\(.*\)$/, "")}</span>
            </button>
          )),
        )}
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
            {/* Decoración: ondas de sonido, destellos y confeti. Detrás de todo. */}
            <div className="print-poster-deco" aria-hidden>
              <span className="print-poster-ring print-poster-ring--1" />
              <span className="print-poster-ring print-poster-ring--2" />
              <span className="print-poster-ring print-poster-ring--3" />
              <span className="print-poster-spark print-poster-spark--1" />
              <span className="print-poster-spark print-poster-spark--2" />
              <span className="print-poster-spark print-poster-spark--3" />
              <span className="print-poster-confetti" />
            </div>

            <div className="print-poster-ticker print-poster-ticker--top" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i}>{t("venue.qr.posterTicker")}</span>
              ))}
            </div>

            <div className="print-poster-top">
              <div className="print-poster-brand">
                <VybeMark size={64} className="print-poster-mark" />
                <span>Fiestea</span>
              </div>
              <div className="print-poster-headline">{t("venue.qr.posterSlogan")}</div>
            </div>

            <div className="print-poster-scan">
              <div className="print-poster-qr">
                <span className="print-poster-corner print-poster-corner--tl" />
                <span className="print-poster-corner print-poster-corner--tr" />
                <span className="print-poster-corner print-poster-corner--bl" />
                <span className="print-poster-corner print-poster-corner--br" />
                {qr}
                <span className="print-poster-qr-logo">
                  <VybeMark size={64} />
                </span>
                <span className="print-poster-sticker">{t("venue.qr.posterScan")}</span>
              </div>
              {!link && code && <div className="print-poster-code">{code}</div>}
            </div>

            <div className="print-poster-bottom">
              {(eventName || venueName || fecha) && (
                <div className="print-poster-event">
                  {eventName && <div className="print-poster-event-name">{eventName}</div>}
                  <div className="print-poster-meta">
                    {fecha && (
                      <span>
                        <Calendar />
                        {fecha}
                      </span>
                    )}
                    {venueName && (
                      <span>
                        <MapPin />
                        {venueName}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <ol className="print-poster-steps">
                {pasos.map((paso, i) => (
                  <li key={paso}>
                    <b>{i + 1}</b>
                    <span>{paso}</span>
                  </li>
                ))}
              </ol>

              <div className="print-poster-footer">
                {t(link ? "venue.qr.posterFooterLink" : "venue.qr.posterFooter")}
                <strong>fiestea.es</strong>
              </div>
            </div>

            <div className="print-poster-ticker print-poster-ticker--bottom" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i}>{t("venue.qr.posterTicker")}</span>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default memo(VenueQRPoster);
