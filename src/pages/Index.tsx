
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import { PartyButton } from "@/components/ui-custom/party-button";
import { User, Building } from "lucide-react";

const Index = () => {
  const { isLoggedIn, isLocationVerified, isEventVerified, userType } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn) {
      if (userType === 'user') {
        if (!isLocationVerified || !isEventVerified) {
          navigate("/location");
        } else {
          navigate("/home");
        }
      } else if (userType === 'venue') {
        navigate("/venue/dashboard");
      }
    }
  }, [isLoggedIn, isLocationVerified, isEventVerified, userType, navigate]);

  const handleUserTypeSelect = (type: 'user' | 'venue') => {
    if (type === 'user') {
      navigate("/auth");
    } else {
      navigate("/venue/auth");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text party-gradient">Vybe</h1>
        <p className="text-party-gray">Una fiesta es cuestión de vibras</p>
        <p className="text-xs text-party-gray mt-1">Mallorca</p>
      </div>

      <div className="max-w-sm w-full space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold mb-2">¿Cómo quieres continuar?</h2>
          <p className="text-party-gray text-sm">Selecciona tu tipo de cuenta</p>
        </div>
        
        <PartyButton 
          variant="gradient" 
          className="w-full flex items-center justify-center gap-3" 
          onClick={() => handleUserTypeSelect('user')}
        >
          <User size={20} />
          <span>Continuar como Usuario</span>
        </PartyButton>
        
        <div className="text-center text-party-gray text-sm my-2">o</div>
        
        <PartyButton 
          variant="outline" 
          className="w-full flex items-center justify-center gap-3" 
          onClick={() => handleUserTypeSelect('venue')}
        >
          <Building size={20} />
          <span>Continuar como Local/Empresa</span>
        </PartyButton>
      </div>
      
      <div className="mt-12 text-center">
        <p className="text-xs text-party-gray">
          Al continuar, aceptas nuestros Términos de servicio y Política de privacidad
        </p>
      </div>
    </div>
  );
};

export default Index;
