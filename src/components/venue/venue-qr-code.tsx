
import { useState, useEffect } from "react";
import { useAppContext } from "@/context/app-context";
import { QrCode, Share2 } from "lucide-react";
import { PartyButton } from "@/components/ui-custom/party-button";
import QRCode from "qrcode.react";

interface VenueQRCodeProps {
  refreshStats: () => void;
}

const VenueQRCode: React.FC<VenueQRCodeProps> = ({ refreshStats }) => {
  const { currentVenue, generateQRCode } = useAppContext();
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [expirationTime, setExpirationTime] = useState<Date | null>(null);

  // Generar código QR al cargar el componente
  useEffect(() => {
    if (!qrValue) {
      generateNewQRCode();
    }
  }, []);

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
        
        // Establecer tiempo de expiración (24 horas)
        const expTime = new Date();
        expTime.setHours(expTime.getHours() + 24);
        setExpirationTime(expTime);
        
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
          Este código es válido durante 24 horas. Los usuarios deben escanearlo para acceder a la app.
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
            <QrCode size={180} className="text-party-primary" />
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
          <PartyButton variant="outline" size="sm" onClick={handleShare}>
            <Share2 size={16} className="mr-2" />
            Compartir
          </PartyButton>
          <PartyButton variant="outline" size="sm" onClick={downloadQRCode}>
            Descargar
          </PartyButton>
        </div>
      </div>
    </div>
  );
};

export default VenueQRCode;
