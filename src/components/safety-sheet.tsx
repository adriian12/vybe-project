import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Trash2, Plus, Siren } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { safetyService, TrustedContact, SosAlert } from '@/services/safety';
import { useAppContext } from '@/context/app-context';
import { getCurrentPosition } from '@/services/geo';
import { ApiError } from '@/services/api';
import { track } from '@/lib/observability';

interface SafetySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Centro de seguridad: contactos de confianza y botón de emergencia.
 *
 * En una app que junta desconocidos de noche esto no es accesorio.
 */
const SafetySheet: React.FC<SafetySheetProps> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeEvent } = useAppContext();

  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [alert, setAlert] = useState<SosAlert | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const [list, active] = await Promise.all([
      safetyService.getContacts(),
      safetyService.getActiveAlert(),
    ]);
    setContacts(list);
    setAlert(active);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const fail = (error: unknown) => {
    const key = error instanceof ApiError ? error.message : 'errors.generic';
    toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
  };

  const addContact = async () => {
    setIsBusy(true);
    try {
      await safetyService.addContact({ name: name.trim(), phone: phone.trim(), email: email.trim() });
      setName('');
      setPhone('');
      setEmail('');
      await load();
      toast({ title: t('safety.contactAdded') });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const removeContact = async (id: string) => {
    try {
      await safetyService.removeContact(id);
      await load();
      toast({ title: t('safety.contactRemoved') });
    } catch (error) {
      fail(error);
    }
  };

  const triggerSos = async () => {
    setConfirmOpen(false);
    setIsBusy(true);

    try {
      // Intentamos adjuntar la ubicación, pero no bloqueamos la alerta por ella.
      const coords = await getCurrentPosition().catch(() => null);

      await safetyService.triggerSos({
        eventId: activeEvent?.eventId,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        note: note.trim() || undefined,
      });

      track('sos_triggered', { hasLocation: Boolean(coords) });
      await load();
      toast({ title: t('safety.sosSent'), description: t('safety.sosSentBody') });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const cancelSos = async () => {
    if (!alert) return;
    try {
      await safetyService.cancelSos(alert.id);
      await load();
      toast({ title: t('safety.sosCancelled') });
    } catch (error) {
      fail(error);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-party-primary" />
              {t('safety.title')}
            </SheetTitle>
            <SheetDescription>{t('safety.sosBody')}</SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-4">
            {/* Alerta activa o botón de emergencia */}
            {alert ? (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                <p className="font-medium flex items-center gap-2 mb-2">
                  <Siren size={16} className="text-destructive animate-pulse" />
                  {t('safety.sosActive')}
                </p>
                <p className="text-xs text-party-gray mb-3">
                  {new Date(alert.createdAt).toLocaleString()}
                </p>
                <PartyButton
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void cancelSos()}
                >
                  {t('safety.sosCancel')}
                </PartyButton>
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.length === 0 ? (
                  <p className="text-sm text-destructive">{t('safety.noContacts')}</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="sos-note">{t('safety.note')}</Label>
                      <Textarea
                        id="sos-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={t('safety.notePlaceholder')}
                        rows={2}
                        maxLength={280}
                      />
                    </div>
                    <PartyButton
                      variant="default"
                      className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => setConfirmOpen(true)}
                      disabled={isBusy}
                    >
                      <Siren size={16} className="mr-2" />
                      {t('safety.sosButton')}
                    </PartyButton>
                  </>
                )}
              </div>
            )}

            {/* Contactos de confianza */}
            <div>
              <p className="font-medium mb-3">{t('safety.contacts')}</p>

              <ul className="space-y-2 mb-4">
                {contacts.map((contact) => (
                  <li
                    key={contact.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{contact.name}</p>
                      <p className="text-xs text-party-gray truncate">
                        {[contact.phone, contact.email].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeContact(contact.id)}
                      className="text-destructive shrink-0"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('safety.contactName')}
                  aria-label={t('safety.contactName')}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('safety.contactPhone')}
                    aria-label={t('safety.contactPhone')}
                  />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('safety.contactEmail')}
                    aria-label={t('safety.contactEmail')}
                  />
                </div>
                <PartyButton
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void addContact()}
                  disabled={isBusy || !name.trim()}
                >
                  <Plus size={14} className="mr-2" />
                  {t('safety.addContact')}
                </PartyButton>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('safety.sosConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('safety.sosConfirmBody', { count: contacts.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void triggerSos()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('safety.sosSend')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SafetySheet;
