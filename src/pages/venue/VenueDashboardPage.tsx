
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import { 
  QrCode, 
  Users, 
  BarChart2, 
  CalendarPlus, 
  Settings,
  Share2,
  Building
} from "lucide-react";
import { PartyButton } from "@/components/ui-custom/party-button";

const VenueDashboardPage = () => {
  const { currentVenue, logout } = useAppContext();
  const [activeTab, setActiveTab] = useState<"qr" | "stats" | "events">("qr");
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-20 h-16 flex items-center justify-between px-4 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-party-dark flex items-center justify-center">
            <Building size={16} className="text-party-primary" />
          </div>
          <span className="font-semibold">{currentVenue?.name || "Mi Local"}</span>
        </div>
        <div className="text-xl font-bold bg-clip-text text-transparent party-gradient">
          Vybe
        </div>
        <button onClick={handleLogout} className="text-sm text-party-gray">
          Salir
        </button>
      </header>

      {/* Main Content */}
      <main className="pt-20 pb-20 px-4">
        {activeTab === "qr" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2">Código QR del Día</h1>
              <p className="text-party-gray text-sm mb-6">
                Este código es válido solo para hoy. Los usuarios deben escanearlo para acceder a la app.
              </p>
              
              <div className="w-64 h-64 mx-auto border-2 border-party-primary rounded-lg flex items-center justify-center mb-4">
                <QrCode size={180} className="text-party-primary" />
              </div>
              
              <div className="flex justify-center space-x-2 mb-8">
                <PartyButton variant="outline" size="sm">
                  <Share2 size={16} className="mr-2" />
                  Compartir
                </PartyButton>
                <PartyButton variant="outline" size="sm">
                  Descargar
                </PartyButton>
              </div>
              
              <div className="bg-party-dark/10 p-4 rounded-lg max-w-sm mx-auto">
                <h3 className="font-semibold mb-1">Estadísticas de hoy:</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-party-primary">24</p>
                    <p className="text-xs text-party-gray">Escaneos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-party-primary">18</p>
                    <p className="text-xs text-party-gray">Usuarios activos</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="max-w-sm mx-auto">
              <h3 className="font-semibold mb-3">Configuración de acceso</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Tipo de evento</p>
                    <p className="text-xs text-party-gray">Discoteca</p>
                  </div>
                  <PartyButton variant="outline" size="sm">Cambiar</PartyButton>
                </div>
                
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Radio de alcance</p>
                    <p className="text-xs text-party-gray">50 metros</p>
                  </div>
                  <PartyButton variant="outline" size="sm">Editar</PartyButton>
                </div>
                
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Modo privado</p>
                    <p className="text-xs text-party-gray">Desactivado</p>
                  </div>
                  <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-muted px-0.5">
                    <span className="translate-x-1 inline-block h-4 w-4 rounded-full bg-background transition"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "stats" && (
          <div className="text-center p-8">
            <BarChart2 size={48} className="mx-auto text-party-primary mb-4" />
            <h2 className="text-xl font-bold mb-2">Estadísticas</h2>
            <p className="text-party-gray mb-4">
              Analiza la actividad en tu local y obtén información valiosa sobre tus asistentes
            </p>
            <p className="text-party-gray">
              (Esta sección será implementada próximamente)
            </p>
          </div>
        )}

        {activeTab === "events" && (
          <div className="text-center p-8">
            <CalendarPlus size={48} className="mx-auto text-party-primary mb-4" />
            <h2 className="text-xl font-bold mb-2">Gestión de Eventos</h2>
            <p className="text-party-gray mb-4">
              Crea y gestiona eventos especiales en tu establecimiento
            </p>
            <p className="text-party-gray">
              (Esta sección será implementada próximamente)
            </p>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border h-16 px-4 flex items-center justify-around">
        <button 
          className={`flex flex-col items-center ${activeTab === "qr" ? "text-party-primary" : "text-party-gray"}`}
          onClick={() => setActiveTab("qr")}
        >
          <QrCode size={20} />
          <span className="text-xs mt-1">Código QR</span>
        </button>
        <button 
          className={`flex flex-col items-center ${activeTab === "stats" ? "text-party-primary" : "text-party-gray"}`}
          onClick={() => setActiveTab("stats")}
        >
          <BarChart2 size={20} />
          <span className="text-xs mt-1">Estadísticas</span>
        </button>
        <button 
          className={`flex flex-col items-center ${activeTab === "events" ? "text-party-primary" : "text-party-gray"}`}
          onClick={() => setActiveTab("events")}
        >
          <CalendarPlus size={20} />
          <span className="text-xs mt-1">Eventos</span>
        </button>
      </nav>
    </div>
  );
};

export default VenueDashboardPage;
