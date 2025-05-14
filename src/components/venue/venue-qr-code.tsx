
import { useState, useEffect } from "react";
import { useAppContext } from "@/context/app-context";
import { QrCode, Share2 } from "lucide-react";
import { PartyButton } from "@/components/ui-custom/party-button";
import QRCode from "qrcode.react";

interface VenueQRCodeProps {
  refreshStats: () => void;
}

const VenueQRCode: React.FC<VenueQRCodeProps> = ({ refreshStats }) => {
  const { currentVenue, generateQRCode, events } = useAppContext();
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [expirationTime, setExpirationTime] = useState<Date | null>(null);
  const [activeEvents, setActiveEvents] = useState<Event[]>([]);

  // Verificar si hay eventos activos
  useEffect(() => {
    if (events && events.length > 0) {
      const now = new Date();
      const active = events.filter(event => {
        const startDate = new Date(event.startDate);
        const endDate = new Date(event.endDate);
        
        // Considerar un evento como activo si:
        // 1. Ya ha empezado y no ha terminado, o
        // 2. Está a punto de empezar (menos de 10 minutos)
        const isActive = 
          (now >= startDate && now <= endDate) || 
          (startDate.getTime() - now.getTime() <= 10 * 60 * 1000);
        
        return isActive;
      });
      
      setActiveEvents(active);
      
      // Si hay eventos activos pero no hay QR, generarlo
      if (active.length > 0 && !qrValue) {
        generateNewQRCode();
      }
    }
  }, [events]);

  // Actualizar tiempo restante
  useEffect(() => {
    if (!expirationTime) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = expirationTime.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft("Expirado");
        clearInterval(interval);
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [expirationTime]);

  const generateNewQRCode = async () => {
    if (!currentVenue) return;
    
    setLoading(true);
    
    try {
      const result = await generateQRCode();
      
      if (result) {
        setQrValue(result.qrCode);
        setManualCode(result.manualCode);
        
        // Si hay eventos activos, establecer el tiempo de expiración al final del último evento
        if (activeEvents.length > 0) {
          const latestEndTime = activeEvents.reduce((latest, event) => {
            const endDate = new Date(event.endDate);
            return endDate > latest ? endDate : latest;
          }, new Date(activeEvents[0].endDate));
          
          setExpirationTime(latestEndTime);
        } else {
          // Si no hay eventos activos, usar el tiempo por defecto (24 horas)
          const expTime = new Date();
          expTime.setHours(expTime.getHours() + 24);
          setExpirationTime(expTime);
        }
        
        // Refrescar estadísticas
        refreshStats();
      }
    } catch (error) {
      console.error('Error generating QR code:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!qrValue) return;
    
    try {
      await navigator.share({
        title: 'Código de acceso Vybe',
        text: `Usa este código para acceder a Vybe: ${manualCode}`,
        url: window.location.href
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const downloadQRCode = () => {
    const canvas = document.getElementById('qr-code') as HTMLCanvasElement;
    if (!canvas) return;
    
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `vybe-qrcode-${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Código QR del Día</h1>
        <p className="text-party-gray text-sm mb-6">
          {activeEvents.length > 0 
            ? "Este código es válido durante el evento. Los usuarios deben escanearlo para acceder a la app."
            : "Este código es válido durante 24 horas. Los usuarios deben escanearlo para acceder a la app."}
        </p>
        
        <div className="w-64 h-64 mx-auto border-2 border-party-primary rounded-lg flex items-center justify-center mb-4 bg-white">
          {qrValue ? (
            <QRCode
              id="qr-code"
              value={qrValue}
              size={200}
              level="H"
              includeMargin={true}
              renderAs="canvas"
            />
          ) : (
            activeEvents.length > 0 ? (
              <div className="text-center">
                <QrCode size={80} className="mx-auto mb-4 text-party-primary" />
                <p className="text-sm text-party-gray">Eventos activos detectados</p>
                <PartyButton 
                  variant="outline" 
                  size="sm" 
                  className="mt-4"
                  onClick={generateNewQRCode}
                  disabled={loading}
                >
                  {loading ? "Generando..." : "Generar QR"}
                </PartyButton>
              </div>
            ) : (
              <div className="text-center">
                <QrCode size={80} className="mx-auto mb-4 text-party-gray" />
                <p className="text-sm text-party-gray">
                  El QR se generará automáticamente cuando tengas eventos activos
                </p>
              </div>
            )
          )}
        </div>
        
        {manualCode && (
          <div className="mb-4 text-center">
            <p className="text-sm mb-1">Código manual:</p>
            <p className="text-2xl font-bold text-party-primary tracking-widest">
              {manualCode}
            </p>
          </div>
        )}
        
        {timeLeft && (
          <div className="mb-4 text-center">
            <p className="text-sm mb-1">Válido durante:</p>
            <p className={`font-mono ${timeLeft === "Expirado" ? "text-red-500" : "text-party-primary"}`}>
              {timeLeft}
            </p>
          </div>
        )}
        
        <div className="flex justify-center space-x-2 mb-8">
          <PartyButton 
            variant="outline" 
            size="sm" 
            onClick={handleShare} 
            disabled={!qrValue}
          >
            <Share2 size={16} className="mr-2" />
            Compartir
          </PartyButton>
          <PartyButton 
            variant="outline" 
            size="sm" 
            onClick={downloadQRCode} 
            disabled={!qrValue}
          >
            Descargar
          </PartyButton>
        </div>
      </div>
    </div>
  );
};

export default VenueQRCode;
