
import { useState, useRef } from 'react';
import { Camera, Check, X } from 'lucide-react';
import { useToast } from "@/components/ui/use-toast";
import { PartyButton } from './ui-custom/party-button';

interface FaceVerificationProps {
  onVerify: (imageData: string) => Promise<boolean>;
  onComplete: () => void;
}

const FaceVerification: React.FC<FaceVerificationProps> = ({ onVerify, onComplete }) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { toast } = useToast();
  
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      setCameraActive(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Error',
        description: 'No se pudo acceder a la cámara. Por favor, verifica los permisos.',
        variant: 'destructive',
      });
    }
  };
  
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    setCameraActive(false);
  };
  
  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg');
    
    setCapturedImage(imageData);
    stopCamera();
  };
  
  const retakeImage = () => {
    setCapturedImage(null);
    startCamera();
  };
  
  const verifyImage = async () => {
    if (!capturedImage) return;
    
    setProcessing(true);
    
    try {
      const result = await onVerify(capturedImage);
      if (result) {
        toast({
          title: 'Verificación exitosa',
          description: 'Tu identidad ha sido verificada correctamente.',
        });
        onComplete();
      } else {
        toast({
          title: 'Verificación fallida',
          description: 'No se pudo verificar tu identidad. Por favor, intenta de nuevo.',
          variant: 'destructive',
        });
        setCapturedImage(null);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Hubo un problema al verificar tu identidad.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4">
      <h2 className="text-xl font-bold mb-6">Verificación de identidad</h2>
      
      {!cameraActive && !capturedImage && (
        <div className="text-center">
          <p className="mb-6">Para verificar tu identidad, necesitamos verificar tu rostro.</p>
          <PartyButton 
            onClick={startCamera}
            className="mx-auto"
          >
            <Camera size={20} className="mr-2" />
            Iniciar cámara
          </PartyButton>
        </div>
      )}
      
      {cameraActive && (
        <div className="relative w-full max-w-sm">
          <div className="aspect-square rounded-lg overflow-hidden bg-black mb-4">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          
          <PartyButton 
            onClick={captureImage}
            className="mx-auto"
          >
            Capturar foto
          </PartyButton>
        </div>
      )}
      
      {capturedImage && (
        <div className="w-full max-w-sm">
          <div className="aspect-square rounded-lg overflow-hidden bg-black mb-4">
            <img
              src={capturedImage}
              alt="Captured"
              className="w-full h-full object-cover"
            />
          </div>
          
          <div className="flex justify-center space-x-4">
            <PartyButton 
              variant="outline"
              onClick={retakeImage}
              disabled={processing}
            >
              <X size={16} className="mr-1" />
              Volver a tomar
            </PartyButton>
            
            <PartyButton 
              onClick={verifyImage}
              disabled={processing}
            >
              <Check size={16} className="mr-1" />
              {processing ? 'Verificando...' : 'Confirmar'}
            </PartyButton>
          </div>
        </div>
      )}
      
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default FaceVerification;
