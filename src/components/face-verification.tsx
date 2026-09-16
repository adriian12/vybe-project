import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, ShieldCheck } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { PartyButton } from './ui-custom/party-button';
import CameraCapture from './camera-capture';

interface FaceVerificationProps {
  onVerify: (imageData: string) => Promise<boolean>;
  onComplete: () => void | Promise<void>;
  onCancel?: () => void;
}

/** `FaceDetector` es experimental y sólo existe en algunos navegadores. */
interface FaceDetectorLike {
  detect: (source: CanvasImageSource) => Promise<unknown[]>;
}

type FaceDetectorConstructor = new (options?: { fastMode?: boolean }) => FaceDetectorLike;

const getFaceDetector = (): FaceDetectorLike | null => {
  const ctor = (window as unknown as { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
  if (!ctor) return null;

  try {
    return new ctor({ fastMode: false });
  } catch {
    return null;
  }
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo leer la imagen'));
    image.src = dataUrl;
  });

/**
 * Comprueba que la captura es utilizable antes de enviarla y devuelve la clave
 * de traducción del problema encontrado, o null si la foto sirve.
 *
 * Sustituye a la validación anterior (`imageData.length > 100`), que daba por
 * buena cualquier cadena. Cuando el navegador expone FaceDetector se exige una
 * cara; si no, se comprueban resolución, brillo y contraste para descartar
 * fotos a oscuras, tapadas o completamente planas.
 */
const analyseCapture = async (dataUrl: string): Promise<string | null> => {
  const image = await loadImage(dataUrl);

  if (image.width < 240 || image.height < 240) return 'faceVerification.lowResolution';

  const detector = getFaceDetector();
  if (detector) {
    try {
      const faces = await detector.detect(image);
      if (faces.length === 0) return 'faceVerification.noFace';
      if (faces.length > 1) return 'faceVerification.manyFaces';
      return null;
    } catch {
      // El detector ha fallado; caemos a las comprobaciones de calidad.
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  let sum = 0;
  let sumSquares = 0;
  let samples = 0;

  // Muestreamos 1 de cada 40 píxeles: suficiente y mucho más barato.
  for (let i = 0; i < data.length; i += 4 * 40) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += luminance;
    sumSquares += luminance * luminance;
    samples += 1;
  }

  if (samples === 0) return null;

  const mean = sum / samples;
  const stdDev = Math.sqrt(Math.max(sumSquares / samples - mean * mean, 0));

  if (mean < 30) return 'faceVerification.tooDark';
  if (mean > 235) return 'faceVerification.tooBright';
  if (stdDev < 12) return 'faceVerification.noDetail';

  return null;
};

const FaceVerification: React.FC<FaceVerificationProps> = ({ onVerify, onComplete, onCancel }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async (dataUrl: string) => {
    setError(null);

    const problem = await analyseCapture(dataUrl);
    if (problem) {
      setError(t(problem));
      return;
    }

    setCapturedImage(dataUrl);
  };

  const verifyImage = async () => {
    if (!capturedImage) return;

    setProcessing(true);
    setError(null);

    try {
      const verified = await onVerify(capturedImage);

      if (verified) {
        toast({
          title: t('faceVerification.successTitle'),
          description: t('faceVerification.successBody'),
        });
        await onComplete();
      } else {
        setError(t('faceVerification.failed'));
        setCapturedImage(null);
      }
    } catch (verifyError) {
      console.error('Face verification failed:', verifyError);
      setError(verifyError instanceof Error ? verifyError.message : t('errors.generic'));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full">
      <ShieldCheck size={36} className="text-party-primary mb-3" />
      <h2 className="text-xl font-bold mb-2">{t('faceVerification.title')}</h2>
      <p className="text-sm text-party-gray text-center mb-6">{t('faceVerification.subtitle')}</p>

      {!capturedImage ? (
        <div className="w-full">
          <CameraCapture
            onCapture={(dataUrl) => void handleCapture(dataUrl)}
            onCancel={onCancel}
            facingMode="user"
            captureLabel={t('faceVerification.capture')}
          />
          {error && <p className="text-destructive text-sm mt-3 text-center">{error}</p>}
        </div>
      ) : (
        <div className="w-full">
          <div className="aspect-square rounded-lg overflow-hidden bg-black mb-4">
            <img src={capturedImage} alt="" className="w-full h-full object-cover" />
          </div>

          {error && <p className="text-destructive text-sm mb-3 text-center">{error}</p>}

          <div className="flex gap-2">
            <PartyButton
              variant="outline"
              className="flex-1"
              onClick={() => {
                setCapturedImage(null);
                setError(null);
              }}
              disabled={processing}
            >
              <X size={16} className="mr-1" />
              {t('faceVerification.retake')}
            </PartyButton>

            <PartyButton
              variant="gradient"
              className="flex-1"
              onClick={() => void verifyImage()}
              disabled={processing}
            >
              <Check size={16} className="mr-1" />
              {processing ? t('faceVerification.verifying') : t('common.confirm')}
            </PartyButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default FaceVerification;
