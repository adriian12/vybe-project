
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "@/context/app-context";
import { PartyButton } from "@/components/ui-custom/party-button";
import { Building, Mail, Check } from "lucide-react";
import { VenueType } from "@/types/venue";

const VenueAuthPage = () => {
  const { loginVenue } = useAppContext();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueType, setVenueType] = useState<VenueType>("discoteca");
  const [phone, setPhone] = useState("");
  const [documents, setDocuments] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const handleNext = () => {
    if (step === 1) {
      // Validar correo electrónico
      if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        setError("Por favor, introduce un correo electrónico válido");
        return;
      }
      setError("");
      setStep(2);
    } else if (step === 2) {
      // Validar nombre del local
      if (!venueName) {
        setError("Por favor, introduce el nombre de tu local");
        return;
      }
      setError("");
      setStep(3);
    }
  };
  
  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      setError("");
    }
  };
  
  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    
    try {
      const success = await loginVenue(email, venueName, venueType);
      
      if (success) {
        navigate("/venue/dashboard");
      } else {
        setError("Hubo un error al registrar tu local. Inténtalo de nuevo más tarde.");
      }
    } catch (error) {
      setError("Ha ocurrido un error. Por favor, inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocuments(e.target.files);
  };
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-16 flex items-center justify-center border-b border-border">
        <h1 className="text-xl font-bold text-transparent bg-clip-text party-gradient">Vybe</h1>
      </header>
      
      {/* Main Content */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center mb-8">
            <div className="w-20 h-20 mx-auto rounded-full bg-party-dark flex items-center justify-center mb-4">
              <Building size={36} className="text-party-primary" />
            </div>
            
            <h1 className="text-2xl font-bold mb-2">
              {step === 1 ? "Verificación de correo electrónico" :
               step === 2 ? "Datos de tu negocio" :
               "Verificación adicional"}
            </h1>
            
            <p className="text-party-gray">
              {step === 1 ? "Introduce tu correo electrónico para comenzar" :
               step === 2 ? "Completa la información de tu establecimiento" :
               "Estos datos nos ayudarán a verificar tu negocio"}
            </p>
          </div>
          
          {/* Stepper */}
          <div className="flex items-center justify-center mb-8">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-party-primary text-white' : 'bg-party-dark/20 text-party-gray'}`}>
              1
            </div>
            <div className={`h-1 w-12 ${step >= 2 ? 'bg-party-primary' : 'bg-party-dark/20'}`}></div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-party-primary text-white' : 'bg-party-dark/20 text-party-gray'}`}>
              2
            </div>
            <div className={`h-1 w-12 ${step >= 3 ? 'bg-party-primary' : 'bg-party-dark/20'}`}></div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-party-primary text-white' : 'bg-party-dark/20 text-party-gray'}`}>
              3
            </div>
          </div>
          
          {/* Form Steps */}
          <div className="space-y-4">
            {/* Step 1: Email verification */}
            {step === 1 && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-1">Correo electrónico *</label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-3 pl-10"
                      placeholder="nombre@empresa.com"
                    />
                    <Mail size={16} className="absolute top-3.5 left-3 text-party-gray" />
                  </div>
                  {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
                  <p className="text-xs text-party-gray mt-1">Recibirás un código de verificación en este correo</p>
                </div>
                
                <div className="pt-4">
                  <PartyButton 
                    variant="gradient"
                    className="w-full"
                    onClick={handleNext}
                  >
                    Continuar
                  </PartyButton>
                </div>
              </>
            )}
            
            {/* Step 2: Business details */}
            {step === 2 && (
              <>
                <div>
                  <label htmlFor="venue-name" className="block text-sm font-medium mb-1">Nombre del establecimiento *</label>
                  <input
                    id="venue-name"
                    type="text"
                    value={venueName}
                    onChange={(e) => setVenueName(e.target.value)}
                    className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-3"
                    placeholder="Nombre de tu local"
                  />
                </div>
                
                <div>
                  <label htmlFor="venue-type" className="block text-sm font-medium mb-1">Tipo de establecimiento *</label>
                  <select
                    id="venue-type"
                    value={venueType}
                    onChange={(e) => setVenueType(e.target.value as VenueType)}
                    className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-3"
                  >
                    <option value="discoteca">Discoteca (100m)</option>
                    <option value="bar">Bar (50m)</option>
                    <option value="local">Local (50m)</option>
                    <option value="fiesta_privada">Fiesta privada (50m)</option>
                    <option value="evento_empresarial">Evento empresarial (250m)</option>
                    <option value="festival">Festival (500m)</option>
                  </select>
                </div>
                
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium mb-1">Teléfono de contacto *</label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-party-dark/20 border border-party-dark/30 rounded-lg px-4 py-3"
                    placeholder="+34 600 000 000"
                  />
                  <p className="text-xs text-party-gray mt-1">Recibirás un SMS de verificación en este número</p>
                </div>
                
                {error && <p className="text-red-500 text-xs">{error}</p>}
                
                <div className="flex space-x-2 pt-4">
                  <PartyButton 
                    variant="outline"
                    className="w-1/2"
                    onClick={handleBack}
                  >
                    Atrás
                  </PartyButton>
                  <PartyButton 
                    variant="gradient"
                    className="w-1/2"
                    onClick={handleNext}
                  >
                    Continuar
                  </PartyButton>
                </div>
              </>
            )}
            
            {/* Step 3: Additional verification */}
            {step === 3 && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Verificación completada</label>
                  <div className="bg-party-dark/10 rounded-lg p-4 flex items-center">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center mr-3">
                      <Check size={16} className="text-white" />
                    </div>
                    <div>
                      <p className="font-medium">{email}</p>
                      <p className="text-xs text-party-gray">Correo verificado correctamente</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Documentación (opcional)</label>
                  <div className="border-2 border-dashed border-party-dark/30 rounded-lg p-6 text-center">
                    <p className="text-sm text-party-gray mb-3">Sube documentos que demuestren ser dueño del local</p>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer bg-party-dark/20 text-party-primary py-2 px-4 rounded inline-block">
                      Seleccionar archivos
                    </label>
                    {documents && documents.length > 0 && (
                      <p className="mt-2 text-xs text-party-gray">
                        {documents.length} archivo(s) seleccionado(s)
                      </p>
                    )}
                    <p className="text-xs text-party-gray mt-2">Máximo 2MB por archivo</p>
                  </div>
                </div>
                
                {error && <p className="text-red-500 text-xs">{error}</p>}
                
                <div className="flex space-x-2 pt-4">
                  <PartyButton 
                    variant="outline"
                    className="w-1/2"
                    onClick={handleBack}
                  >
                    Atrás
                  </PartyButton>
                  <PartyButton 
                    variant="gradient"
                    className="w-1/2"
                    onClick={handleSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <span className="mr-2 w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                        Registrando...
                      </span>
                    ) : (
                      "Completar registro"
                    )}
                  </PartyButton>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default VenueAuthPage;
