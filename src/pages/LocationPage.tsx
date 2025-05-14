
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import { PartyButton } from "@/components/ui-custom/party-button";
import { MapPin, QrCode } from "lucide-react";
import QRScanner from "@/components/qr-scanner";

const LocationPage = () => {
  const [isCheckingLocation, setIsCheckingLocation] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [eventDetails, setEventDetails] = useState<any>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
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
      // Solicitar permisos de geolocalización
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            // Posición obtenida correctamente
            console.log("Ubicación obtenida:", position.coords.latitude, position.coords.longitude);
            
            const success = await verifyLocation();
            if (success) {
              setShowQrScanner(true);
            }
            setIsCheckingLocation(false);
          },
          (error) => {
            // Error al obtener la posición
            console.error("Error obteniendo ubicación:", error);
            setIsCheckingLocation(false);
          },
          { enableHighAccuracy: true }
        );
      } else {
        // Navegador no soporta geolocalización
        console.error("La geolocalización no es soportada por este navegador");
        setIsCheckingLocation(false);
      }
    } catch (error) {
      console.error("Error verificando ubicación:", error);
      setIsCheckingLocation(false);
    }
  };

  const handleQrScanSuccess = async (code: string) => {
    try {
      // Simular obtención de detalles del evento
      const mockEventDetails = {
        id: "event123",
        name: "Fiesta Electrónica",
        venue: "Club Vybe",
        date: new Date().toLocaleDateString(),
        time: "22:00 - 05:00",
        theme: "Techno",
        activePeople: 45,
        validUntil: new Date(new Date().setHours(new Date().getHours() + 10)).toLocaleString()
      };
      
      setEventDetails(mockEventDetails);
      setShowEventDetails(true);
    } catch (error) {
      console.error("Error scanning QR code:", error);
    }
  };

  const handleAccessEvent = async () => {
    if (!eventDetails) return;
    
    try {
      const success = await verifyEventCode(eventDetails.id);
      if (success) {
        navigate("/home");
      }
    } catch (error) {
      console.error("Error accessing event:", error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {!showQrScanner && !showEventDetails ? (
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
        ) : showEventDetails ? (
          <>
            <div className="w-24 h-24 rounded-full bg-party-dark flex items-center justify-center mb-8">
              <QrCode size={48} className="text-party-primary" />
            </div>
            
            <h1 className="text-2xl font-bold text-center mb-4">
              Evento detectado
            </h1>
            
            <div className="w-full max-w-sm bg-party-dark/10 p-6 rounded-lg mb-8">
              <h2 className="text-xl font-bold mb-2">{eventDetails.name}</h2>
              <p className="text-party-gray mb-4">{eventDetails.venue}</p>
              
              <div className="space-y-2 mb-6">
                <p><span className="text-party-gray">Fecha:</span> {eventDetails.date}</p>
                <p><span className="text-party-gray">Hora:</span> {eventDetails.time}</p>
                <p><span className="text-party-gray">Tema:</span> {eventDetails.theme}</p>
                <p><span className="text-party-gray">Asistentes actuales:</span> {eventDetails.activePeople}</p>
                <p><span className="text-party-gray">Válido hasta:</span> {eventDetails.validUntil}</p>
              </div>
              
              <PartyButton 
                variant="gradient" 
                onClick={handleAccessEvent}
                className="w-full"
              >
                Acceder al evento
              </PartyButton>
            </div>
            
            <button 
              className="text-party-gray text-sm"
              onClick={() => setShowEventDetails(false)}
            >
              Escanear otro código
            </button>
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
