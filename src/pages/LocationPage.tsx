
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import { PartyButton } from "@/components/ui-custom/party-button";
import { MapPin, QrCode } from "lucide-react";
import QRScanner from "@/components/qr-scanner";

const LocationPage = () => {
  const [isCheckingLocation, setIsCheckingLocation] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const { verifyLocation, verifyEventCode, isLocationVerified, isEventVerified } = useAppContext();
  const navigate = useNavigate();

  // Si ya tenemos verificada la ubicación y el evento, ir a la página principal
  useEffect(() => {
    if (isLocationVerified && isEventVerified) {
      navigate("/home");
    }
  }, [isLocationVerified, isEventVerified, navigate]);

  const handleCheckLocation = async () => {
    setIsCheckingLocation(true);
    try {
      const success = await verifyLocation();
      if (success) {
        setShowQrScanner(true);
      }
    } finally {
      setIsCheckingLocation(false);
    }
  };

  const handleQrScanSuccess = async (code: string) => {
    const success = await verifyEventCode(code);
    if (success) {
      navigate("/home");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {!showQrScanner ? (
          <>
            <div className="w-24 h-24 rounded-full bg-party-dark flex items-center justify-center mb-8">
              <MapPin size={48} className="text-party-primary" />
            </div>
            
            <h1 className="text-2xl font-bold text-center mb-4">
              Verifica tu ubicación
            </h1>
            
            <p className="text-center text-party-gray mb-4 max-w-xs">
              Vybe solo funciona dentro de eventos, discotecas o fiestas verificadas
            </p>
            
            <p className="text-center text-party-gray mb-8 max-w-xs">
              Solo podrás ver perfiles en un radio de 50m de tu ubicación actual
            </p>
            
            <PartyButton 
              variant="gradient" 
              onClick={handleCheckLocation}
              disabled={isCheckingLocation}
              className="w-full max-w-xs"
            >
              {isCheckingLocation ? (
                <span className="flex items-center justify-center">
                  <span className="mr-2 w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                  Verificando...
                </span>
              ) : (
                "Verificar mi ubicación"
              )}
            </PartyButton>
          </>
        ) : (
          <>
            <div className="w-24 h-24 rounded-full bg-party-dark flex items-center justify-center mb-8">
              <QrCode size={48} className="text-party-primary" />
            </div>
            
            <h1 className="text-2xl font-bold text-center mb-4">
              Escanea el código del evento
            </h1>
            
            <p className="text-center text-party-gray mb-4 max-w-xs">
              Para garantizar exclusividad, cada evento tiene su propio código QR diario
            </p>
            
            <p className="text-center text-party-gray mb-8 max-w-xs">
              Solicita el código al organizador del evento o establecimiento
            </p>
            
            <QRScanner onScanSuccess={handleQrScanSuccess} />
          </>
        )}
      </div>
    </div>
  );
};

export default LocationPage;
