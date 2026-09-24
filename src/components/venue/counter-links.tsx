import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode.react';
import { Copy, Eye, Link2, Loader2, MessageCircle, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { isNative } from '@/services/native';
import { CounterLink, venueService } from '@/services/venue-service';
import { APP_URL, siteMode } from '@/lib/hosts';
import { cn } from '@/lib/utils';

interface CounterLinksProps {
  eventId: string;
}

/**
 * Dirección del contador. En `app.vybes.es` y en la app, la de producción; en
 * local y en las previews, la del propio servidor, para poder probarlo.
 */
const counterUrl = (token: string): string => {
  const base = siteMode() === 'all' && !isNative() ? window.location.origin : APP_URL;
  return `${base}/contador/${token}`;
};

const hora = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Enlaces de contador para el portero.
 *
 * El portero no suele tener cuenta (a menudo es de una empresa de seguridad),
 * así que el local le pasa un enlace por WhatsApp o le enseña el QR. El enlace
 * sólo sirve para contar en este evento, caduca dos horas después del cierre y
 * se puede revocar. El token se enseña una única vez, al crearlo: en la base de
 * datos sólo se guarda su huella.
 */
const CounterLinks = ({ eventId }: CounterLinksProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [links, setLinks] = useState<CounterLink[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [nuevo, setNuevo] = useState<string | null>(null);
  // «Ver enlace»: el de un enlace ya creado, en una ventana. `sinToken` si se
  // creó antes de poder volver a verlo.
  const [viendo, setViendo] = useState<{ label: string; url: string | null } | null>(null);

  const load = useCallback(async () => {
    setLinks(await venueService.listCounterLinks(eventId));
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fail = (error: unknown) => {
    const key = error instanceof ApiError ? error.message : 'errors.generic';
    toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
  };

  const crear = async () => {
    setBusy(true);
    try {
      const { token } = await venueService.createCounterLink(eventId, label.trim() || undefined);
      setNuevo(counterUrl(token));
      setLabel('');
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const revocar = async (id: string) => {
    setBusy(true);
    try {
      await venueService.revokeCounterLink(id);
      await load();
      toast({ title: t('venue.counter.revoked') });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('venue.counter.copied') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const ahora = Date.now();

  const ver = async (link: CounterLink) => {
    try {
      const token = await venueService.getCounterLinkToken(link.id);
      setViendo({ label: link.label ?? t('venue.counter.noLabel'), url: token ? counterUrl(token) : null });
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    }
  };

  /** QR, enlace, copiar y WhatsApp: igual al crearlo que al volver a verlo. */
  const compartir = (url: string) => (
    <>
      <div className="mx-auto w-fit rounded-xl bg-white p-2 leading-none">
        <QRCode value={url} size={148} level="M" renderAs="svg" />
      </div>
      <p className="break-all rounded-lg bg-black/[0.05] px-2 py-1.5 font-mono text-[12px]">{url}</p>
      <div className="grid grid-cols-2 gap-2">
        <PartyButton size="sm" variant="outline" className="gap-1.5" onClick={() => void copiar(url)}>
          <Copy size={15} />
          {t('venue.counter.copy')}
        </PartyButton>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(t('venue.counter.whatsappText', { url }))}`}
          target="_blank"
          rel="noreferrer"
          className="press flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-body-sm font-bold text-white"
        >
          <MessageCircle size={15} />
          WhatsApp
        </a>
      </div>
    </>
  );

  return (
    <div className="surface-light rounded-2xl p-4">
      <div className="mb-1 flex items-center gap-2">
        <Link2 size={17} className="text-party-primary" />
        <h3 className="font-display text-title-card uppercase tracking-wide">{t('venue.counter.linksTitle')}</h3>
      </div>
      <p className="mb-3 text-body-sm text-party-gray">{t('venue.counter.linksBody')}</p>

      {nuevo ? (
        <div className="enter space-y-3 rounded-xl bg-party-primary/15 p-3">
          <p className="text-body-sm font-bold">{t('venue.counter.created')}</p>
          {compartir(nuevo)}
          <button
            type="button"
            onClick={() => setNuevo(null)}
            className="press w-full text-center text-caption font-bold underline underline-offset-2"
          >
            {t('venue.counter.done')}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            value={label}
            maxLength={40}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('venue.counter.labelPlaceholder')}
            aria-label={t('venue.counter.labelPlaceholder')}
            className="h-10"
          />
          <PartyButton size="sm" className="h-10 shrink-0 gap-1" disabled={busy} onClick={() => void crear()}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {t('venue.counter.create')}
          </PartyButton>
        </div>
      )}

      {links.length > 0 && (
        <ul className="mt-3 divide-y divide-black/[0.06]">
          {links.map((link) => {
            const caducado = new Date(link.expiresAt).getTime() <= ahora;
            const inactivo = Boolean(link.revokedAt) || caducado;
            return (
              <li key={link.id} className={cn('flex items-center gap-3 py-2.5', inactivo && 'opacity-45')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-bold">{link.label ?? t('venue.counter.noLabel')}</p>
                  <p className="truncate text-caption text-party-gray">
                    {link.revokedAt
                      ? t('venue.counter.statusRevoked')
                      : caducado
                        ? t('venue.counter.statusExpired')
                        : link.lastUsedAt
                          ? t('venue.counter.lastUsed', { time: hora(link.lastUsedAt) })
                          : t('venue.counter.notUsed')}
                  </p>
                </div>
                {!inactivo && (
                  <button
                    type="button"
                    onClick={() => void ver(link)}
                    className="press flex h-8 items-center gap-1 rounded-lg px-2 text-caption font-bold text-ink"
                  >
                    <Eye size={14} />
                    {t('venue.counter.view')}
                  </button>
                )}
                {!inactivo && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void revocar(link.id)}
                    aria-label={t('venue.counter.revoke')}
                    className="press flex h-8 items-center gap-1 rounded-lg px-2 text-caption font-bold text-destructive"
                  >
                    <X size={14} />
                    {t('venue.counter.revoke')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={Boolean(viendo)} onOpenChange={(open) => !open && setViendo(null)}>
        <DialogContent className="surface-light !bg-white text-ink sm:max-w-sm">
          <DialogHeader className="text-left">
            <DialogTitle>{viendo?.label}</DialogTitle>
            <DialogDescription className="text-ink/60">{t('venue.counter.viewBody')}</DialogDescription>
          </DialogHeader>
          {viendo?.url ? (
            <div className="space-y-3">{compartir(viendo.url)}</div>
          ) : (
            <p className="rounded-xl bg-black/[0.04] p-3 text-body-sm">{t('venue.counter.viewOld')}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CounterLinks;
