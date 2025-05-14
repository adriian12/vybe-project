
import { useState, useEffect } from "react";
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
import VenueQRCode from "@/components/venue/venue-qr-code";
import CreateEventForm from "@/components/venue/create-event-form";

const VenueDashboardPage = () => {
  const { currentVenue, logout, events } = useAppContext();
  const [activeTab, setActiveTab] = useState<"qr" | "stats" | "events">("qr");
  const [statsData, setStatsData] = useState({
    scans: 24,
    activeUsers: 18
  });
  const [statsPeriod, setStatsPeriod] = useState<"total" | "year" | "month" | "week">("total");
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const refreshStats = () => {
    // En un caso real, obtendríamos las estadísticas actualizadas
    setStatsData({
      scans: Math.floor(Math.random() * 50) + 10,
      activeUsers: Math.floor(Math.random() * 30) + 5
    });
  };

  useEffect(() => {
    refreshStats();
  }, [statsPeriod]);

  const getPeriodStats = () => {
    // En un caso real, estos datos vendrían de una API
    switch (statsPeriod) {
      case "total":
        return {
          scans: 1248,
          activeUsers: 847,
          eventCount: events.length || 12,
          avgAttendance: 32
        };
      case "year":
        return {
          scans: 876,
          activeUsers: 542,
          eventCount: 8,
          avgAttendance: 28
        };
      case "month":
        return {
          scans: 346,
          activeUsers: 218,
          eventCount: 4,
          avgAttendance: 24
        };
      case "week":
        return {
          scans: 124,
          activeUsers: 76,
          eventCount: 2,
          avgAttendance: 18
        };
      default:
        return {
          scans: 1248,
          activeUsers: 847,
          eventCount: events.length || 12,
          avgAttendance: 32
        };
    }
  };

  const periodStats = getPeriodStats();

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
            <VenueQRCode refreshStats={refreshStats} />
            
            <div className="bg-party-dark/10 p-4 rounded-lg max-w-sm mx-auto">
              <h3 className="font-semibold mb-1">Estadísticas de hoy:</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-party-primary">{statsData.scans}</p>
                  <p className="text-xs text-party-gray">Escaneos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-party-primary">{statsData.activeUsers}</p>
                  <p className="text-xs text-party-gray">Usuarios activos</p>
                </div>
              </div>
            </div>
            
            <div className="max-w-sm mx-auto">
              <h3 className="font-semibold mb-3">Configuración de acceso</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Tipo de evento</p>
                    <p className="text-xs text-party-gray">{currentVenue?.type || "Discoteca"}</p>
                  </div>
                  <p className="text-xs text-party-gray italic">Contacta con administración para cambiar</p>
                </div>
                
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">Radio de alcance</p>
                    <p className="text-xs text-party-gray">{currentVenue?.eventRadius || 50} metros</p>
                  </div>
                  <p className="text-xs text-party-gray italic">Contacta con administración para cambiar</p>
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
          <div className="space-y-6">
            <div className="text-center mb-8">
              <BarChart2 size={48} className="mx-auto text-party-primary mb-4" />
              <h2 className="text-xl font-bold mb-2">Estadísticas</h2>
              <p className="text-party-gray mb-4">
                Analiza la actividad en tu local y obtén información valiosa sobre tus asistentes
              </p>
            </div>
            
            <div className="bg-party-dark/10 p-4 rounded-lg max-w-sm mx-auto">
              <div className="grid grid-cols-4 gap-2 mb-6 text-center">
                <button 
                  className={`py-1 px-2 ${statsPeriod === "total" ? "bg-party-primary text-white" : "bg-party-dark/20"} text-xs rounded-full`}
                  onClick={() => setStatsPeriod("total")}
                >
                  Total
                </button>
                <button 
                  className={`py-1 px-2 ${statsPeriod === "year" ? "bg-party-primary text-white" : "bg-party-dark/20"} text-xs rounded-full`}
                  onClick={() => setStatsPeriod("year")}
                >
                  Año
                </button>
                <button 
                  className={`py-1 px-2 ${statsPeriod === "month" ? "bg-party-primary text-white" : "bg-party-dark/20"} text-xs rounded-full`}
                  onClick={() => setStatsPeriod("month")}
                >
                  Mes
                </button>
                <button 
                  className={`py-1 px-2 ${statsPeriod === "week" ? "bg-party-primary text-white" : "bg-party-dark/20"} text-xs rounded-full`}
                  onClick={() => setStatsPeriod("week")}
                >
                  Semana
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="bg-party-dark/5 p-3 rounded-lg">
                  <p className="text-xs text-party-gray mb-1">Total de escaneos</p>
                  <p className="text-2xl font-bold">{periodStats.scans}</p>
                </div>
                
                <div className="bg-party-dark/5 p-3 rounded-lg">
                  <p className="text-xs text-party-gray mb-1">Usuarios activos</p>
                  <p className="text-2xl font-bold">{periodStats.activeUsers}</p>
                </div>
                
                <div className="bg-party-dark/5 p-3 rounded-lg">
                  <p className="text-xs text-party-gray mb-1">Eventos creados</p>
                  <p className="text-2xl font-bold">{periodStats.eventCount}</p>
                </div>
                
                <div className="bg-party-dark/5 p-3 rounded-lg">
                  <p className="text-xs text-party-gray mb-1">Promedio de asistencia</p>
                  <p className="text-2xl font-bold">{periodStats.avgAttendance}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "events" && (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold mb-2 text-center">Gestión de Eventos</h2>
              <p className="text-party-gray text-center mb-6">
                Crea y gestiona eventos especiales en tu establecimiento
              </p>
            </div>
            
            {events.length > 0 ? (
              <div className="space-y-4 mb-8">
                <h3 className="font-semibold">Eventos próximos</h3>
                
                {events.map((event) => (
                  <div key={event.id} className="bg-party-dark/10 p-4 rounded-lg">
                    <h4 className="font-bold">{event.name}</h4>
                    <p className="text-xs text-party-gray mb-2">
                      {new Date(event.startDate).toLocaleDateString()} - {new Date(event.startDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                      {event.theme && (
                        <p><span className="text-party-gray">Temática:</span> {event.theme}</p>
                      )}
                      {event.dressCode && (
                        <p><span className="text-party-gray">Dress code:</span> {event.dressCode}</p>
                      )}
                      {event.minAge && (
                        <p><span className="text-party-gray">Edad:</span> {event.minAge}+</p>
                      )}
                      {event.price && (
                        <p><span className="text-party-gray">Precio:</span> {event.price}€</p>
                      )}
                    </div>
                    
                    <div className="flex space-x-2">
                      <PartyButton variant="outline" size="sm">Editar</PartyButton>
                      {event.bookingUrl && (
                        <PartyButton variant="outline" size="sm" onClick={() => window.open(event.bookingUrl, '_blank')}>
                          Reservas
                        </PartyButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            
            <CreateEventForm />
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
