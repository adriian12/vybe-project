import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, Download, QrCode, RefreshCw, Timer } from 'lucide-react';
import QRCode from 'qrcode.react';
import { useAppContext } from '@/context/app-context';
import { PartyButton } from '@/components/ui-custom/party-button';
import { VybeMark } from '@/components/brand/vybe-logo';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiError } from '@/services/api';
import { venueService } from '@/services/venue-service';
import { track } from '@/lib/observability';
import { Event } from '@/types/venue';
import VenueQRPoster from '@/components/venue/venue-qr-poster';
import VenueTvView from '@/components/venue/venue-tv-view';

interface VenueQRCodeProps {
  onCodeGenerated?: () => void;
}

const QR_CANVAS_ID = 'vybe-venue-qr';
const ROTATION_OPTIONS = [0, 15, 30, 60, 120];

const VenueQRCode: React.FC<VenueQRCodeProps> = ({ onCodeGenerated }) => {
  const { t } = useTranslation();
  const { currentVenue, events } = useAppContext();
  const { toast } = useToast();

  const [manualCode, setManualCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [codeEventId, setCodeEventId] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Eventos del local en curso o que empiezan en menos de una hora.
  const activeEvents = useMemo(() => {
    if (!currentVenue) return [];
    const current = Date.now();

    return events.filter((event) => {
      if (event.venueId !== currentVenue.id) return false;
      const start = new Date(event.startDate).getTime();
      const end = new Date(event.endDate).getTime();
      return (current >= start && current <= end) || start - current <= 60 * 60 * 1000;
    });
  }, [events, currentVenue]);

  const currentEvent: Event | undefined = activeEvents[0];

  // Recupera el código vigente en vez de generar uno nuevo en cada visita.
  useEffect(() => {
    if (!currentVenue) return;
    let cancelled = false;

    void api.getActiveEventCode(currentVenue.id).then((existing) => {
      if (cancelled || !existing) return;
      setManualCode(existing.manualCode);
      setExpiresAt(new Date(existing.expiresAt));
      setCodeEventId(existing.eventId);
    });

    return () => {
      cancelled = true;
    };
  }, [currentVenue]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Rotación automática: un código filtrado por WhatsApp deja de servir pronto.
  useEffect(() => {
    if (!currentVenue || rotation === 0) return;

    const check = async () => {
      const result = await venueService.rotateIfNeeded(currentVenue.id);
      if (!result) return;

      setManualCode(result.code);
      setExpiresAt(new Date(result.expiresAt));
      if (result.rotated) toast({ title: t('venue.qr.rotated') });
    };

    void check();
    const interval = setInterval(() => void check(), 60_000);
    return () => clearInterval(interval);
  }, [currentVenue, rotation, toast, t]);

  const isExpired = expiresAt !== null && expiresAt.getTime() <= now;

  const generateNewCode = useCallback(async () => {
    if (!currentVenue) return;

    setLoading(true);
    try {
      // El código caduca con el evento; si no hay evento, en 12 horas.
      const expiry = currentEvent
        ? new Date(currentEvent.endDate)
        : new Date(Date.now() + 12 * 60 * 60 * 1000);

      const result = await api.generateEventCode(currentVenue.id, currentEvent?.id ?? null, expiry);

      if (rotation > 0) await venueService.setRotation(currentVenue.id, rotation);

      setManualCode(result.manualCode);
      setExpiresAt(new Date(result.expiresAt));
      setCodeEventId(currentEvent?.id ?? null);
      track('venue_code_generated', { eventId: currentEvent?.id });
      onCodeGenerated?.();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof ApiError ? error.message : t('errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentVenue, currentEvent, rotation, onCodeGenerated, toast, t]);

  const changeRotation = async (minutes: number) => {
    setRotation(minutes);
    if (!currentVenue || !manualCode) return;

    try {
      await venueService.setRotation(currentVenue.id, minutes || null);
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    if (!manualCode) return;
    const text = t('venue.qr.shareText', { code: manualCode });

    if (navigator.share) {
      try {
        await navigator.share({ title: t('venue.qr.title'), text });
        return;
      } catch {
        return; // El usuario ha cancelado el diálogo de compartir.
      }
    }

    await navigator.clipboard.writeText(text);
    toast({ title: t('venue.qr.copied'), description: t('venue.qr.copiedBody') });
  };

  const downloadQRCode = () => {
    const canvas = document.getElementById(QR_CANVAS_ID) as HTMLCanvasElement | null;
    if (!canvas) return;

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `vybe-qr-${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!currentVenue) return null;

  if (!currentVenue.isVerified) {
    return (
      <div className="surface-light mx-auto max-w-md rounded-2xl p-6 text-center">
        <AlertTriangle size={40} className="mx-auto mb-4 text-destructive" />
        <h2 className="mb-2 font-display text-headline-md">{t('venue.pendingTitle')}</h2>
        <p className="text-body-sm text-party-gray">{t('venue.qr.notVerified')}</p>
      </div>
    );
  }

  const vigente = Boolean(manualCode) && !isExpired;
  const restanteMs = expiresAt ? expiresAt.getTime() - now : 0;
  const horas = Math.floor(restanteMs / 3_600_000);
  const minutos = Math.floor((restanteMs % 3_600_000) / 60_000);

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ tarjeta del código */}
      <div className="surface-light rounded-2xl p-5 text-center">
        {currentEvent && (
          <p className="mb-3 truncate text-caption font-bold uppercase tracking-wide text-party-gray">
            {currentEvent.name} ·{' '}
            {new Date(currentEvent.startDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            {' – '}
            {new Date(currentEvent.endDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}

        <div className="relative mx-auto flex h-56 w-56 items-center justify-center rounded-2xl border border-black/[0.08] bg-white shadow-sm">
          {vigente ? (
            <>
              <QRCode
                id={QR_CANVAS_ID}
                value={manualCode as string}
                size={200}
                level="H"
                includeMargin
                renderAs="canvas"
              />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-party-primary p-1 shadow">
                <VybeMark size={26} />
              </span>
            </>
          ) : (
            <div className="p-6 text-center">
              <QrCode size={64} className="mx-auto mb-3 text-ink/25" />
              <p className="text-body-sm text-party-gray">
                {isExpired ? t('venue.qr.expired') : t('venue.qr.notGenerated')}
              </p>
            </div>
          )}
        </div>

        {vigente && (
          <>
            <p className="mt-4 text-caption uppercase tracking-widest text-party-gray">{t('venue.qr.manualCodeLabel')}</p>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="press mx-auto mt-1 flex items-center gap-2 font-mono text-[34px] font-bold tracking-[0.18em] text-ink"
              aria-label={t('venue.qr.share')}
            >
              {manualCode}
              <Copy size={16} className="text-ink/40" />
            </button>
            {expiresAt && (
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-party-primary px-3 py-1 text-caption font-bold text-ink">
                <Timer size={14} />
                {t('venue.qr.expiresInShort', { hours: horas, minutes: minutos })}
              </span>
            )}
          </>
        )}

        {currentEvent && manualCode && codeEventId !== currentEvent.id && (
          <p className="mt-3 text-caption text-destructive">{t('venue.qr.notLinked')}</p>
        )}
      </div>

      <p className="px-2 text-center text-body-sm text-party-gray">
        {currentEvent ? t('venue.qr.withEvent') : t('venue.qr.withoutEvent')}
      </p>

      {vigente && (
        // Los dos sacan el código de esta pantalla, así que van a la par y en
        // pequeño: uno encima de otro pesaban más que el propio QR.
        <div className="grid grid-cols-2 gap-2">
          <VenueQRPoster code={manualCode as string} eventName={currentEvent?.name} venueName={currentVenue?.name} />
          {currentEvent ? (
            <VenueTvView
              code={manualCode as string}
              eventId={currentEvent.id}
              eventName={currentEvent.name}
              venueName={currentVenue?.name}
            />
          ) : (
            <PartyButton variant="outline" size="sm" onClick={downloadQRCode}>
              <Download size={14} />
              {t('venue.qr.download')}
            </PartyButton>
          )}
        </div>
      )}

      {/* ------------------------------------------------ rotación automática */}
      <div className="surface-light mt-2 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-display text-title-card">{t('venue.qr.rotation')}</p>
            <p className="text-caption text-party-gray">{t('venue.qr.rotationHelp')}</p>
          </div>
          <Switch
            checked={rotation > 0}
            onCheckedChange={(v) => void changeRotation(v ? 30 : 0)}
            aria-label={t('venue.qr.rotation')}
          />
        </div>
        {rotation > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-3">
            <label htmlFor="rotation-select" className="text-body-sm text-party-gray">
              {t('venue.qr.rotationInterval')}
            </label>
            <Select value={String(rotation)} onValueChange={(value) => void changeRotation(Number(value))}>
              <SelectTrigger id="rotation-select" className="h-9 w-auto min-w-[9rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROTATION_OPTIONS.filter((m) => m > 0).map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {t('venue.qr.rotationMinutes', { count: minutes })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <PartyButton size="lg" className="w-full" onClick={() => void generateNewCode()} disabled={loading}>
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        {loading ? t('venue.qr.generating') : manualCode ? t('venue.qr.regenerate') : t('venue.qr.generate')}
      </PartyButton>
    </div>
  );
};

export default VenueQRCode;
