
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { PartyButton } from "@/components/ui-custom/party-button";
import { Camera, Check, Upload, Info } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/use-toast";

const ProfilePage = () => {
  const { currentUser, logout } = useAppContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [photoType, setPhotoType] = useState<"avatar" | "profile">("avatar");
  const [showPhotoInfo, setShowPhotoInfo] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/auth");
  };

  const handlePhotoUpload = (type: "avatar" | "profile") => {
    setPhotoType(type);
    
    // En un caso real, aquí usaríamos la API de la cámara o galería
    if (type === "avatar") {
      // Para el avatar permitimos subir desde la galería
      toast({
        title: "Selección de avatar",
        description: "Puedes elegir una foto de tu galería para tu avatar",
      });
    } else {
      // Para las fotos de perfil, exigimos usar la cámara dentro de la ubicación
      toast({
        title: "Foto de perfil",
        description: "Esta foto debe tomarse con la cámara dentro del evento",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen pb-16 pt-16">
      <Header />
      
      <main className="max-w-lg mx-auto p-4">
        <div className="mb-6 text-center">
          <div className="relative w-32 h-32 mx-auto mb-4">
            <div className="w-full h-full rounded-full overflow-hidden border-4 border-party-primary">
              <Avatar className="w-full h-full">
                <AvatarImage 
                  src={currentUser?.photos[0] || "https://i.pravatar.cc/300?img=32"} 
                  alt="Avatar" 
                />
                <AvatarFallback>
                  {currentUser?.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
            </div>
            <button 
              onClick={() => handlePhotoUpload("avatar")}
              className="absolute bottom-0 right-0 bg-party-primary rounded-full p-2"
            >
              <Upload size={20} />
            </button>
          </div>
          
          <h1 className="text-2xl font-bold mb-1">
            {currentUser?.name || "Usuario"}, {currentUser?.age || "28"}
          </h1>
          
          <div className="flex items-center justify-center mb-4">
            <span className="bg-party-primary/20 text-party-primary text-xs px-2 py-1 rounded-full flex items-center">
              <Check size={14} className="mr-1" />
              Verificado
            </span>
          </div>
          
          <p className="text-party-gray">
            {currentUser?.bio || "Edita tu perfil para añadir una descripción"}
          </p>
        </div>
        
        <div className="space-y-6">
          <div className="bg-card rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Fotos</h2>
              <button 
                onClick={() => setShowPhotoInfo(!showPhotoInfo)}
                className="text-party-gray"
              >
                <Info size={18} />
              </button>
            </div>
            
            {showPhotoInfo && (
              <div className="bg-party-dark/30 p-3 rounded-md text-sm mb-3">
                <p className="text-party-gray">
                  <span className="text-party-primary font-medium">Importante:</span> Las fotos de perfil deben ser tomadas con la cámara dentro del evento para garantizar tu presencia.
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-3 gap-2">
              <div className="aspect-square rounded-lg overflow-hidden">
                <img
                  src={currentUser?.photos[0] || "https://i.pravatar.cc/300?img=32"}
                  alt="Foto 1"
                  className="w-full h-full object-cover"
                />
              </div>
              
              <button 
                onClick={() => handlePhotoUpload("profile")}
                className="aspect-square rounded-lg bg-party-dark/50 flex flex-col items-center justify-center"
              >
                <Camera size={24} className="text-party-gray mb-1" />
                <span className="text-xs text-party-gray">Tomar foto</span>
              </button>
              
              <button
                onClick={() => handlePhotoUpload("profile")}
                className="aspect-square rounded-lg bg-party-dark/50 flex flex-col items-center justify-center"
              >
                <Camera size={24} className="text-party-gray mb-1" />
                <span className="text-xs text-party-gray">Tomar foto</span>
              </button>
            </div>
          </div>
          
          <div className="bg-card rounded-xl p-4 space-y-4">
            <h2 className="text-lg font-medium">Ajustes</h2>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 border-b border-muted">
                <span>Distancia máxima</span>
                <span className="text-party-primary">50m</span>
              </div>
              
              <div className="flex items-center justify-between p-2 border-b border-muted">
                <span>Modo invisible</span>
                <div className="w-10 h-6 bg-muted rounded-full relative">
                  <div className="w-4 h-4 bg-party-gray rounded-full absolute top-1 left-1"></div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-2 border-b border-muted">
                <span>Notificaciones</span>
                <div className="w-10 h-6 bg-party-primary rounded-full relative">
                  <div className="w-4 h-4 bg-white rounded-full absolute top-1 right-1"></div>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-2">
                <span>Ubicación actual</span>
                <span className="text-party-primary">Mallorca</span>
              </div>
            </div>
          </div>
          
          <PartyButton variant="outline" className="w-full" onClick={handleLogout}>
            Cerrar sesión
          </PartyButton>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default ProfilePage;
