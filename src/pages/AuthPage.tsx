
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import { PartyButton } from "@/components/ui-custom/party-button";
import { Camera } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const AuthPage = () => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [step, setStep] = useState<"phone" | "code" | "selfie">("phone");
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const { toast } = useToast();
  const {
    login
  } = useAppContext();
  const navigate = useNavigate();

  const validatePhoneNumber = (phone: string): boolean => {
    // Regex simple para validar un número de teléfono
    const phoneRegex = /^\+?[0-9]{9,15}$/;
    return phoneRegex.test(phone);
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    
    if (!validatePhoneNumber(phoneNumber)) {
      setPhoneError("Número de teléfono no válido. Debe tener entre 9 y 15 dígitos.");
      return;
    }

    // Simulación de verificación de existencia del número
    // En una aplicación real, esto sería una llamada a una API
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      
      // Simulación de número no existente (1 de cada 10 veces)
      if (Math.random() < 0.1) {
        setPhoneError("El número de teléfono no existe en nuestro sistema.");
        return;
      }
      
      // Mostrar toast de éxito
      toast({
        title: "Código enviado",
        description: `Se ha enviado un código de verificación al número ${phoneNumber}`,
      });
      
      setStep("code");
    }, 1500);
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    
    if (verificationCode.length !== 6) {
      setCodeError("El código debe tener 6 dígitos");
      return;
    }

    setIsLoading(true);
    try {
      // Simulación de verificación de código inválido (1 de cada 10 veces)
      if (Math.random() < 0.1) {
        setCodeError("Código de verificación incorrecto o expirado.");
        setIsLoading(false);
        return;
      }
      
      const success = await login(phoneNumber);
      if (success) {
        setStep("selfie");
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSelfieSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/location");
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col justify-center p-6">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-2 text-transparent bg-clip-text party-gradient">Vybe</h1>
          <p className="text-party-gray">Una fiesta es cuestión de vibras</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={handlePhoneSubmit} className="space-y-6 max-w-sm mx-auto">
            <div className="space-y-2">
              <label htmlFor="phoneNumber" className="block text-sm font-medium">
                Número de teléfono
              </label>
              <input 
                id="phoneNumber" 
                type="tel" 
                placeholder="+34 600000000" 
                className={`w-full p-3 rounded-lg bg-muted border ${phoneError ? 'border-red-500' : 'border-border'} focus:border-party-primary focus:outline-none`}
                value={phoneNumber} 
                onChange={e => setPhoneNumber(e.target.value)} 
                required 
              />
              {phoneError && (
                <p className="text-red-500 text-xs">{phoneError}</p>
              )}
            </div>
            <PartyButton variant="gradient" className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <span className="mr-2 w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                  Verificando...
                </span>
              ) : "Continuar"}
            </PartyButton>
            <p className="text-xs text-center text-party-gray">
              Te enviaremos un código de verificación a este número
            </p>
          </form>
        ) : step === "code" ? (
          <form onSubmit={handleCodeSubmit} className="space-y-6 max-w-sm mx-auto">
            <div className="space-y-2">
              <label htmlFor="verificationCode" className="block text-sm font-medium">
                Código de verificación
              </label>
              <input 
                id="verificationCode" 
                type="text" 
                placeholder="123456" 
                className={`w-full p-3 rounded-lg bg-muted border ${codeError ? 'border-red-500' : 'border-border'} focus:border-party-primary focus:outline-none`}
                value={verificationCode} 
                onChange={e => setVerificationCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} 
                maxLength={6} 
                pattern="[0-9]{6}" 
                required 
              />
              {codeError && (
                <p className="text-red-500 text-xs">{codeError}</p>
              )}
            </div>
            <PartyButton variant="gradient" className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <span className="mr-2 w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                  Verificando...
                </span>
              ) : "Verificar"}
            </PartyButton>
            <button 
              type="button" 
              className="text-sm text-party-primary block mx-auto" 
              onClick={() => setStep("phone")}
            >
              Cambiar número de teléfono
            </button>
          </form>
        ) : (
          <form onSubmit={handleSelfieSubmit} className="space-y-6 max-w-sm mx-auto">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold mb-2">Verificación de identidad</h2>
              <p className="text-party-gray text-sm">
                Para garantizar un ambiente seguro, necesitamos verificar tu identidad
              </p>
            </div>
            
            <div className="border-2 border-dashed border-party-primary rounded-lg p-4 flex flex-col items-center justify-center h-64">
              <div className="w-20 h-20 rounded-full bg-party-dark flex items-center justify-center mb-4">
                <Camera size={40} className="text-party-primary" />
              </div>
              <p className="text-center text-sm text-party-gray mb-4">
                Toma un selfie donde se vea claramente tu rostro
              </p>
              <PartyButton variant="outline" type="button">
                <Camera size={16} className="mr-2" />
                Tomar selfie
              </PartyButton>
            </div>
            
            <p className="text-xs text-center text-party-gray">
              Solo aceptamos fotos donde aparezca una persona claramente visible
            </p>
            
            <PartyButton variant="gradient" className="w-full" type="submit">
              Continuar
            </PartyButton>
          </form>
        )}
      </div>

      <div className="p-6">
        <p className="text-xs text-center text-party-gray">
          Al continuar, aceptas nuestros Términos de servicio y Política de privacidad
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
