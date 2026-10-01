import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode.react";
import { Printer } from "lucide-react";
import { PartyButton } from "@/components/ui-custom/party-button";

interface VenueQRPosterProps {
  /** Código de acceso que se imprime como QR. */
  code: string;
  eventName?: string;
  venueName?: string;
}

/**
 * Cartel imprimible con el QR del evento, para colgar en la puerta o dejar en
 * la barra.
 *
 * Se maqueta en el propio documento y se muestra sólo al imprimir, en lugar de
 * abrir una ventana nueva: los navegadores bloquean las ventanas emergentes y
 * el local se quedaría sin cartel sin saber por qué.
 *
 * `print-poster` en `index.css` es lo que oculta el resto de la página y deja
 * el cartel a página completa. Esa regla oculta todo lo que cuelga de `body`
 * salvo el cartel, así que el cartel **tiene** que colgar de `body`: por eso va
 * en un portal. Dentro de la app se ocultaba con ella y salía la hoja en blanco.
 */
const VenueQRPoster = ({ code, eventName, venueName }: VenueQRPosterProps) => {
  const { t } = useTranslation();

  return (
    <>
      <PartyButton
        variant="outline"
        size="sm"
        className="w-full gap-2"
        // Primero se pinta el clic y luego se abre el diálogo de imprimir, que
        // bloquea la página mientras está abierto.
        onClick={() => window.setTimeout(() => window.print(), 50)}
      >
        <Printer size={16} />
        {t("venue.qr.printPoster")}
      </PartyButton>

      {createPortal(
        <div className="print-poster" aria-hidden="true">
          <div className="print-poster-inner">
            <div className="print-poster-brand">Fiestea</div>

            <div className="print-poster-headline">
              {t("venue.qr.posterSlogan")}
            </div>

            <div className="print-poster-qr">
              {/* Nivel H de corrección de errores: el cartel acabará con marcas
                de vasos y luz de discoteca, y aun así tiene que leerse. */}
              <QRCode
                value={code}
                size={520}
                level="H"
                includeMargin
                renderAs="svg"
              />
            </div>

            <div className="print-poster-code">{code}</div>

            <div className="print-poster-event">
              {eventName && (
                <div className="print-poster-event-name">{eventName}</div>
              )}
              {venueName && (
                <div className="print-poster-venue">{venueName}</div>
              )}
            </div>

            <div className="print-poster-footer">
              {t("venue.qr.posterFooter")}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default VenueQRPoster;
