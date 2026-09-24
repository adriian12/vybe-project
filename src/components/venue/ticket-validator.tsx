import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, CheckCircle2, Loader2, ScanLine, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/services/api';
import { ticketsService, ValidatedTicket } from '@/services/tickets';
import { cn } from '@/lib/utils';

/** Lo que enseña el validador tras leer un código. */
export interface CodeCheck {
  /** Ya se había usado: sale en rojo. */
  alreadyUsed: boolean;
  headline: string;
  detail: string;
}

interface CodeValidatorProps {
  title: string;
  placeholder: string;
  /** Longitud mínima para poder pulsar «Validar». */
  minLength: number;
  maxLength: number;
  check: (code: string) => Promise<CodeCheck>;
}

let lectores = 0;

/**
 * Validar un código en la puerta o en la barra: se escanea el QR con la cámara
 * o se escribe. Lo usan las entradas (Seguridad) y los vales (Camareros).
 */
export const CodeValidator = ({ title, placeholder, minLength, maxLength, check }: CodeValidatorProps) => {
  const { t } = useTranslation();
  const [readerId] = useState(() => `code-validator-reader-${(lectores += 1)}`);
  const [codigo, setCodigo] = useState('');
  const [busy, setBusy] = useState(false);
  const [camara, setCamara] = useState(false);
  const [resultado, setResultado] = useState<CodeCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const pararCamara = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setCamara(false);
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      // Ya estaba parada.
    }
  }, []);

  useEffect(() => () => void pararCamara(), [pararCamara]);

  const validar = useCallback(
    async (valor: string) => {
      const limpio = valor.trim().toUpperCase();
      if (!limpio) return;
      setBusy(true);
      setError(null);
      setResultado(null);
      try {
        setResultado(await check(limpio));
        setCodigo('');
        navigator.vibrate?.(80);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'errors.generic');
        navigator.vibrate?.([200, 100, 200]);
      } finally {
        setBusy(false);
      }
    },
    [check],
  );

  const abrirCamara = async () => {
    setError(null);
    setCamara(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const { Html5Qrcode: Lector, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
      const scanner = new Lector(readerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.7), height: Math.floor(h * 0.7) }) },
        (texto) => {
          void pararCamara();
          void validar(texto);
        },
        () => {
          // Fotograma sin QR.
        },
      );
    } catch {
      await pararCamara();
      setError('scanner.cameraError');
    }
  };

  return (
    <div className="surface-light rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <ScanLine size={17} />
          {title}
        </h3>
        <button
          type="button"
          onClick={() => (camara ? void pararCamara() : void abrirCamara())}
          className="press flex h-9 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold"
        >
          {camara ? <CameraOff size={14} /> : <Camera size={14} />}
          {t(camara ? 'sales.validator.stop' : 'sales.validator.scan')}
        </button>
      </div>

      {camara && <div id={readerId} className="mb-3 overflow-hidden rounded-xl bg-black" />}

      <form
        className="flex flex-col gap-2 sm:flex-row lg:flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void validar(codigo);
        }}
      >
        <Input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder={placeholder}
          aria-label={t('sales.validator.code')}
          maxLength={maxLength}
          className="h-11 font-mono tracking-wider"
          autoCapitalize="characters"
        />
        <button
          type="submit"
          disabled={busy || codigo.trim().length < minLength}
          className="press flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-party-primary px-4 font-bold text-ink disabled:opacity-40"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {t('sales.validator.validate')}
        </button>
      </form>

      {resultado && (
        <div
          className={cn(
            'mt-3 flex items-start gap-3 rounded-xl p-3',
            resultado.alreadyUsed ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 text-emerald-800',
          )}
        >
          {resultado.alreadyUsed ? <XCircle size={22} className="shrink-0" /> : <CheckCircle2 size={22} className="shrink-0" />}
          <div className="min-w-0">
            <p className="font-display text-title-card">{resultado.headline}</p>
            <p className="text-body-sm text-ink">{resultado.detail}</p>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-body-sm font-bold text-destructive">
          <XCircle size={18} className="shrink-0" />
          {t(error)}
        </p>
      )}
    </div>
  );
};

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Validar en la puerta una entrada o mesa comprada en la app.
 *
 * Se escanea el QR de «Entradas» con la cámara o se escribe el código
 * (E-XXXXXXXX). Una entrada sólo vale una vez: si ya se usó, sale en rojo con
 * la hora a la que entró. Lo usan el propietario y Seguridad (con cuenta o con
 * su enlace, que pasa su propio `validate`).
 */
const TicketValidator = ({ validate = ticketsService.validate }: { validate?: (code: string) => Promise<ValidatedTicket> }) => {
  const { t } = useTranslation();

  const check = useCallback(
    async (code: string): Promise<CodeCheck> => {
      const r = await validate(code);
      return {
        alreadyUsed: r.alreadyUsed,
        headline: r.alreadyUsed
          ? t('sales.validator.alreadyUsed', { time: hora(r.usedAt) })
          : t(r.kind === 'table' ? 'sales.validator.tableOk' : 'sales.validator.entryOk'),
        detail: `${r.holderName} · ${r.typeName}${r.guests ? ` · ${t('tickets.buy.guests', { count: r.guests })}` : ''}`,
      };
    },
    [validate, t],
  );

  return (
    <CodeValidator
      title={t('sales.validator.title')}
      placeholder="E-XXXXXXXX"
      minLength={10}
      maxLength={10}
      check={check}
    />
  );
};

export default TicketValidator;
