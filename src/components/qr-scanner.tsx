import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { ArrowRight, Camera, CameraOff, Keyboard, Lock, X } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';

interface QRScannerProps {
  onScanSuccess: (code: string) => void;
  /** Deshabilita la entrada mientras el código anterior se está validando. */
  isValidating?: boolean;
  error?: string | null;
  /**
   * Bloquea la cámara y el código mientras falte algo previo, como estar
   * dentro del radio del local.
   */
  disabled?: boolean;
  /** Lo que va entre el visor y el código manual: el estado de la ubicación. */
  status?: React.ReactNode;
}

const READER_ID = 'vybe-qr-reader';
const CODE_LENGTH = 6;

/**
 * Extrae el código de acceso de lo que devuelve el QR.
 *
 * El QR de un local codifica el propio código de 6 caracteres, pero se aceptan
 * también formatos antiguos tipo `VYBE-<venue>-<codigo>` y URLs con ?code=.
 */
const extractCode = (raw: string): string => {
  const value = raw.trim();

  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get('code');
    if (fromQuery) return fromQuery.trim();
  } catch {
    // No era una URL; seguimos con el resto de formatos.
  }

  if (value.toUpperCase().startsWith('VYBE-')) {
    const parts = value.split('-');
    return parts[parts.length - 1].trim();
  }

  return value;
};

/** Una esquina amarilla en «L» del visor. */
const Esquina: React.FC<{ className: string }> = ({ className }) => (
  <span aria-hidden className={cn('absolute h-9 w-9 border-party-primary', className)} />
);

/**
 * El lector de la puerta, como en «Acceso al Evento» de Stitch: visor cuadrado
 * con esquinas amarillas y una línea que barre, y debajo el código a mano en
 * seis casillas.
 *
 * Los códigos que generan los locales tienen siempre seis caracteres (dígitos
 * los generales, letras y dígitos los de relaciones públicas), así que las
 * casillas no se quedan cortas.
 */
const QRScanner: React.FC<QRScannerProps> = ({
  onScanSuccess,
  isValidating = false,
  error,
  disabled = false,
  status,
}) => {
  const { t } = useTranslation();

  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const otpRef = useRef<HTMLInputElement | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;

    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch (stopError) {
      console.error('Error stopping scanner:', stopError);
    } finally {
      scannerRef.current = null;
      if (isMounted.current) setScanning(false);
    }
  }, []);

  // Cierra la cámara al desmontar para no dejar el LED encendido.
  useEffect(() => () => void stopCamera(), [stopCamera]);

  // Si deja de cumplirse lo previo (sales del radio), la cámara se apaga.
  useEffect(() => {
    if (disabled) void stopCamera();
  }, [disabled, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setScanning(true);

    // El div del lector sólo existe cuando `scanning` es true.
    await new Promise((resolve) => setTimeout(resolve, 0));

    try {
      const scanner = new Html5Qrcode(READER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.72), height: Math.floor(h * 0.72) }) },
        (decodedText) => {
          void stopCamera();
          onScanSuccess(extractCode(decodedText));
        },
        () => {
          // Fotograma sin QR: no es un error que mostrar.
        },
      );
    } catch (startError) {
      console.error('Error starting camera:', startError);
      scannerRef.current = null;
      if (!isMounted.current) return;
      setScanning(false);
      setCameraError(t('scanner.cameraError'));
    }
  }, [onScanSuccess, stopCamera, t]);

  const completo = manualCode.length === CODE_LENGTH;
  const visibleError = error ?? cameraError;

  return (
    <div className="w-full space-y-4">
      {/* ------------------------------------------------------------ visor */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-card">
        {scanning ? (
          <div id={READER_ID} className="h-full w-full" />
        ) : (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={disabled || isValidating}
            className="press flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center disabled:opacity-50"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-high text-party-primary">
              {cameraError ? <CameraOff size={30} /> : <Camera size={30} />}
            </span>
            <span className="max-w-[16rem] text-body-md text-party-gray">
              {cameraError ? t('scanner.unavailable') : t('scanner.activate')}
            </span>
            {!cameraError && (
              <span className="rounded-xl bg-party-primary px-5 py-2.5 text-sm font-bold text-ink">
                {t('scanner.scan')}
              </span>
            )}
          </button>
        )}

        {/* Las esquinas marcan dónde poner el QR; la línea dice que está
            leyendo. Van por encima del vídeo y no reciben toques. */}
        <div className="pointer-events-none absolute inset-[12%]">
          <Esquina className="left-0 top-0 rounded-tl-lg border-l-[3px] border-t-[3px]" />
          <Esquina className="right-0 top-0 rounded-tr-lg border-r-[3px] border-t-[3px]" />
          <Esquina className="bottom-0 left-0 rounded-bl-lg border-b-[3px] border-l-[3px]" />
          <Esquina className="bottom-0 right-0 rounded-br-lg border-b-[3px] border-r-[3px]" />
          {scanning && (
            // El envoltorio mide lo mismo que el área y se desplaza su propio
            // alto: así la línea recorre el cuadro entero moviendo sólo
            // `transform`, sin medir nada.
            <span className="absolute inset-x-2 top-0 h-full animate-scan-line motion-reduce:animate-none">
              <span className="block h-0.5 w-full bg-party-primary shadow-[0_0_12px_#F8D000]" />
            </span>
          )}
        </div>

        {scanning && (
          <button
            type="button"
            onClick={() => void stopCamera()}
            aria-label={t('scanner.stop')}
            className="press absolute bottom-4 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-[#0E0E11]/80 text-white"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {status}

      {/* ------------------------------------------------------------ o */}
      <div className="flex items-center gap-4 text-party-gray" aria-hidden>
        <span className="h-px flex-1 bg-surface-high" />
        <span className="text-body-sm">{t('scanner.or').toLowerCase()}</span>
        <span className="h-px flex-1 bg-surface-high" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (completo) onScanSuccess(extractCode(manualCode));
        }}
        className="space-y-4"
      >
        <button
          type="button"
          onClick={() => otpRef.current?.focus()}
          disabled={disabled}
          className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-card font-display text-title-card disabled:opacity-50"
        >
          <Keyboard size={18} className="text-party-gray" />
          {t('scanner.manualButton')}
        </button>

        <InputOTP
          ref={otpRef}
          maxLength={CODE_LENGTH}
          value={manualCode}
          onChange={(value) => setManualCode(value.toUpperCase())}
          pattern="^[a-zA-Z0-9]*$"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          disabled={disabled || isValidating}
          aria-label={t('scanner.manualPlaceholder')}
          containerClassName="justify-center"
        >
          <InputOTPGroup className="grid w-full grid-cols-6 gap-2">
            {Array.from({ length: CODE_LENGTH }).map((_, index) => (
              <InputOTPSlot
                key={index}
                index={index}
                className={cn(
                  'h-14 w-full rounded-xl border-0 border-b-2 bg-card font-display text-2xl font-bold first:rounded-l-xl first:border-l-0 last:rounded-r-xl',
                  manualCode[index] ? 'border-party-primary' : 'border-party-primary/30',
                )}
              />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {visibleError && (
          <p role="alert" className="text-center text-body-sm text-destructive">
            {visibleError}
          </p>
        )}

        <button
          type="submit"
          disabled={!completo || disabled || isValidating}
          className="press flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-headline-md text-ink disabled:opacity-40"
        >
          {isValidating ? t('scanner.validating') : t('eventAccess.enter')}
          {!isValidating && <ArrowRight size={20} />}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-center text-body-sm text-party-gray">
          <Lock size={14} />
          {t('scanner.serverChecked')}
        </p>
      </form>
    </div>
  );
};

export default QRScanner;
