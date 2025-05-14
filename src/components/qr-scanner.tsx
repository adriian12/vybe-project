
import { useState } from 'react';
import { PartyButton } from './ui-custom/party-button';
import { Camera } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface QRScannerProps {
  onScanSuccess: (code: string) => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess }) => {
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState('');
  const { toast } = useToast();

  // Simulación de escaneo
  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      onScanSuccess('EVENT123456');
    }, 2000);
  };

  const validateCode = (code: string) => {
    return code.length >= 6;
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!manualCode.trim()) {
      setError('Por favor ingresa un código');
      return;
    }
    
    if (!validateCode(manualCode)) {
      setError('Código inválido. Debe tener al menos 6 caracteres');
      toast({
        title: "Código inválido",
        description: "El código ingresado no es válido",
        variant: "destructive",
      });
      return;
    }
    
    onScanSuccess(manualCode);
  };

  return (
    <div className="p-4">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Escanea el QR del evento</h2>
        <p className="text-party-gray">
          Para acceder a la fiesta, escanea el código QR proporcionado por el organizador
        </p>
      </div>

      <div className={`w-64 h-64 mx-auto mb-8 border-2 border-dashed border-party-primary rounded-lg flex items-center justify-center ${scanning ? 'animate-pulse-soft' : ''}`}>
        {scanning ? (
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-party-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p>Escaneando...</p>
          </div>
        ) : (
          <div className="text-center">
            <Camera size={64} className="mx-auto mb-4 text-party-gray" />
            <p className="text-party-gray text-sm">Haz clic para activar la cámara</p>
          </div>
        )}
      </div>

      <PartyButton
        variant="gradient"
        className="w-full mb-6"
        onClick={handleScan}
        disabled={scanning}
      >
        {scanning ? 'Escaneando...' : 'Escanear código QR'}
      </PartyButton>

      <div className="text-center mb-4">
        <span className="inline-block px-4 py-2 relative">
          <span className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-party-gray/30"></span>
          </span>
          <span className="relative bg-background px-4 text-party-gray">O</span>
        </span>
      </div>

      <form onSubmit={handleManualSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="Introduce el código del evento"
            className="w-full p-3 rounded-lg bg-muted border border-border focus:border-party-primary focus:outline-none"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
          />
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
        <PartyButton 
          variant="outline"
          className="w-full"
          type="submit"
        >
          Confirmar código
        </PartyButton>
      </form>
    </div>
  );
};

export default QRScanner;
