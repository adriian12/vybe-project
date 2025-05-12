
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import { PartyButton } from "@/components/ui-custom/party-button";
import { Building, Mail, Phone, FileText, CheckCircle } from "lucide-react";

const VenueAuthPage = () => {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"credentials" | "verification" | "details">("credentials");
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [venueName, setVenueName] = useState("");
  const [venueType, setVenueType] = useState("discoteca");
  const [document, setDocument] = useState<File | null>(null);
  
  const { loginVenue } = useAppContext();
  const navigate = useNavigate();

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim().length > 0 && phone.trim().length >= 9) {
      // En una implementación real, aquí enviaríamos un código de verificación
      setStep("verification");
    }
  };

  const handleVerificationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length === 6) {
      setStep("details");
    }
  };
  
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // En una implementación real, aquí subiríamos el documento y crearíamos el local
      const success = await loginVenue(email, venueName, venueType);
      if (success) {
        navigate("/venue/dashboard");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setDocument(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col justify-center p-6">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-2 text-transparent bg-clip-text party-gradient">Vybe</h1>
          <p className="text-party-gray">Gestión de Locales y Eventos</p>
        </div>

        {step === "credentials" ? (
          <form onSubmit={handleCredentialsSubmit} className="space-y-6 max-w-sm mx-auto">
            <div className="w-20 h-20 rounded-full bg-party-dark flex items-center justify-center mx-auto mb-6">
              <Building size={36} className="text-party-primary" />
            </div>
            
            <h2 className="text-xl font-bold text-center mb-4">Registro de Local/Empresa</h2>
            
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium">
                Correo electrónico
              </label>
              <div className="flex">
                <div className="bg-muted p-3 rounded-l-lg border border-r-0 border-border">
                  <Mail size={20} className="text-party-gray" />
                </div>
                <input 
                  id="email" 
                  type="email" 
                  placeholder="tu@empresa.com" 
                  className="w-full p-3 rounded-r-lg bg-muted border border-border focus:border-party-primary focus:outline-none" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="phone" className="block text-sm font-medium">
                Número de teléfono
              </label>
              <div className="flex">
                <div className="bg-muted p-3 rounded-l-lg border border-r-0 border-border">
                  <Phone size={20} className="text-party-gray" />
                </div>
                <input 
                  id="phone" 
                  type="tel" 
                  placeholder="+34 971000000" 
                  className="w-full p-3 rounded-r-lg bg-muted border border-border focus:border-party-primary focus:outline-none" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)} 
                  required 
                />
              </div>
            </div>
            
            <PartyButton variant="gradient" className="w-full" type="submit">
              Continuar
            </PartyButton>
            
            <p className="text-xs text-center text-party-gray">
              Enviaremos un código de verificación a tu correo y teléfono
            </p>
          </form>
        ) : step === "verification" ? (
          <form onSubmit={handleVerificationSubmit} className="space-y-6 max-w-sm mx-auto">
            <div className="space-y-2">
              <label htmlFor="verificationCode" className="block text-sm font-medium">
                Código de verificación
              </label>
              <input 
                id="verificationCode" 
                type="text" 
                placeholder="123456" 
                className="w-full p-3 rounded-lg bg-muted border border-border focus:border-party-primary focus:outline-none" 
                value={verificationCode} 
                onChange={e => setVerificationCode(e.target.value)} 
                maxLength={6} 
                pattern="[0-9]{6}" 
                required 
              />
            </div>
            <PartyButton variant="gradient" className="w-full" type="submit">
              Verificar
            </PartyButton>
            <button 
              type="button" 
              className="text-sm text-party-primary block mx-auto" 
              onClick={() => setStep("credentials")}
            >
              Cambiar correo o teléfono
            </button>
          </form>
        ) : (
          <form onSubmit={handleDetailsSubmit} className="space-y-6 max-w-sm mx-auto">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold mb-2">Detalles del local</h2>
              <p className="text-party-gray text-sm">
                Para verificar tu negocio, necesitamos algunos datos adicionales
              </p>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="venueName" className="block text-sm font-medium">
                Nombre del local
              </label>
              <input 
                id="venueName" 
                type="text"
                placeholder="Nombre de tu local o empresa" 
                className="w-full p-3 rounded-lg bg-muted border border-border focus:border-party-primary focus:outline-none" 
                value={venueName} 
                onChange={e => setVenueName(e.target.value)} 
                required 
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="venueType" className="block text-sm font-medium">
                Tipo de establecimiento
              </label>
              <select
                id="venueType"
                className="w-full p-3 rounded-lg bg-muted border border-border focus:border-party-primary focus:outline-none"
                value={venueType}
                onChange={e => setVenueType(e.target.value)}
                required
              >
                <option value="discoteca">Discoteca</option>
                <option value="bar">Bar</option>
                <option value="festival">Festival</option>
                <option value="fiesta_privada">Fiesta Privada</option>
                <option value="evento">Evento Empresarial</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="document" className="block text-sm font-medium">
                Documento de registro (opcional)
              </label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                {document ? (
                  <div className="flex items-center justify-center space-x-2">
                    <FileText size={24} className="text-green-500" />
                    <span className="text-sm truncate max-w-[200px]">{document.name}</span>
                    <button
                      type="button"
                      className="text-xs text-red-500"
                      onClick={() => setDocument(null)}
                    >
                      Eliminar
                    </button>
                  </div>
                ) : (
                  <>
                    <FileText size={32} className="mx-auto mb-2 text-party-gray" />
                    <p className="text-sm text-party-gray mb-2">
                      Sube un documento que acredite tu negocio
                    </p>
                    <PartyButton variant="outline" size="sm" asChild>
                      <label htmlFor="file-upload" className="cursor-pointer">
                        Seleccionar archivo
                      </label>
                    </PartyButton>
                    <input
                      id="file-upload"
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileChange}
                    />
                  </>
                )}
              </div>
              <p className="text-xs text-party-gray">
                Formatos aceptados: PDF, JPG, PNG (max 5MB)
              </p>
            </div>
            
            <div className="flex items-start space-x-2 my-4">
              <CheckCircle size={20} className="text-party-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-party-gray">
                Una vez verificado, podrás generar códigos QR diarios, crear eventos y acceder al panel de administración.
              </p>
            </div>
            
            <PartyButton 
              variant="gradient" 
              className="w-full" 
              type="submit"
              disabled={isLoading || !venueName}
            >
              {isLoading ? "Procesando..." : "Completar registro"}
            </PartyButton>
          </form>
        )}
      </div>

      <div className="p-6">
        <p className="text-xs text-center text-party-gray">
          Al continuar, aceptas nuestros Términos de servicio y Política de privacidad para negocios
        </p>
      </div>
    </div>
  );
};

export default VenueAuthPage;
