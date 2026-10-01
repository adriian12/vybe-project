import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, RefreshCw, SwitchCamera, X } from 'lucide-react';
import { PartyButton } from './ui-custom/party-button';

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
  onCancel?: () => void;
  facingMode?: 'user' | 'environment';
  /** Texto del botón de captura. */
  captureLabel?: string;
}

/**
 * Captura una foto real con la cámara del dispositivo.
 *
 * Vybe exige fotos tomadas en el momento dentro del evento; antes se generaban
 * avatares aleatorios de un servicio externo, lo que vaciaba de sentido la
 * verificación de presencia.
 *
 * Se puede cambiar a la cámara de atrás, porque muchas veces la foto te la hace
 * alguien. La vista previa **no** va en espejo: se veía al revés que la foto
 * que se enviaba, y quien se ponía de perfil acababa volteado.
 */
const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onCancel,
  facingMode = 'user',
  captureLabel,
}) => {
  const { t } = useTranslation();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [camara, setCamara] = useState<'user' | 'environment'>(facingMode);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: camara, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsReady(true);
    } catch (cameraError) {
      console.error('Error accessing camera:', cameraError);
      setError(t('scanner.cameraError'));
    }
  }, [camara, t]);

  useEffect(() => {
    void startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    // Recorte cuadrado centrado, para que la foto no dependa de la orientación.
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(
      video,
      (video.videoWidth - size) / 2,
      (video.videoHeight - size) / 2,
      size,
      size,
      0,
      0,
      size,
      size,
    );

    onCapture(canvas.toDataURL('image/jpeg', 0.85));
  }, [onCapture]);

  return (
    <div className="w-full">
      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-black mb-4">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {isReady && !error && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setCamara((actual) => (actual === 'user' ? 'environment' : 'user'));
            }}
            aria-label={t('camera.switch')}
            className="press absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur"
          >
            <SwitchCamera size={20} />
          </button>
        )}
        {!isReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {error ? (
        <div className="space-y-3">
          <p className="text-destructive text-sm text-center">{error}</p>
          <PartyButton variant="outline" className="w-full" onClick={() => void startCamera()}>
            <RefreshCw size={16} className="mr-2" />
            {t('common.retry')}
          </PartyButton>
        </div>
      ) : (
        <div className="flex gap-2">
          {onCancel && (
            <PartyButton
              variant="outline"
              className="flex-1"
              onClick={() => {
                stopCamera();
                onCancel();
              }}
            >
              <X size={16} className="mr-2" />
              {t('common.cancel')}
            </PartyButton>
          )}
          <PartyButton
            variant="gradient"
            className="flex-1"
            onClick={capture}
            disabled={!isReady}
          >
            <Camera size={16} className="mr-2" />
            {captureLabel ?? t('swiping.takePhoto')}
          </PartyButton>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraCapture;
