import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import { PartyButton } from "@/components/ui-custom/party-button";
const AuthPage = () => {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const {
    login
  } = useAppContext();
  const navigate = useNavigate();
  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.trim().length >= 9) {
      // En una implementación real, aquí enviaríamos un código de verificación
      setStep("code");
    }
  };
  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length === 6) {
      setIsLoading(true);
      // Simular verificación de código
      try {
        const success = await login(phoneNumber);
        if (success) {
          navigate("/location");
        }
      } finally {
        setIsLoading(false);
      }
    }
  };
  return <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col justify-center p-6">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-2 text-transparent bg-clip-text party-gradient">Vybe</h1>
          <p className="text-party-gray">Una fiesta es cuestión de vibras</p>
        </div>

        {step === "phone" ? <form onSubmit={handlePhoneSubmit} className="space-y-6 max-w-sm mx-auto">
            <div className="space-y-2">
              <label htmlFor="phoneNumber" className="block text-sm font-medium">
                Número de teléfono
              </label>
              <input id="phoneNumber" type="tel" placeholder="+34 600000000" className="w-full p-3 rounded-lg bg-muted border border-border focus:border-party-primary focus:outline-none" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} required />
            </div>
            <PartyButton variant="gradient" className="w-full" type="submit">
              Continuar
            </PartyButton>
            <p className="text-xs text-center text-party-gray">
              Te enviaremos un código de verificación a este número
            </p>
          </form> : <form onSubmit={handleCodeSubmit} className="space-y-6 max-w-sm mx-auto">
            <div className="space-y-2">
              <label htmlFor="verificationCode" className="block text-sm font-medium">
                Código de verificación
              </label>
              <input id="verificationCode" type="text" placeholder="123456" className="w-full p-3 rounded-lg bg-muted border border-border focus:border-party-primary focus:outline-none" value={verificationCode} onChange={e => setVerificationCode(e.target.value)} maxLength={6} pattern="[0-9]{6}" required />
            </div>
            <PartyButton variant="gradient" className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? "Verificando..." : "Verificar"}
            </PartyButton>
            <button type="button" className="text-sm text-party-primary block mx-auto" onClick={() => setStep("phone")}>
              Cambiar número de teléfono
            </button>
          </form>}
      </div>

      <div className="p-6">
        <p className="text-xs text-center text-party-gray">
          Al continuar, aceptas nuestros Términos de servicio y Política de privacidad
        </p>
      </div>
    </div>;
};
export default AuthPage;