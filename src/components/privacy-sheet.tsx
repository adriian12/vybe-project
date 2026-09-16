import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, Trash2, FileText, ShieldCheck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { privacyService, ConsentRecord } from '@/services/privacy';
import { track } from '@/lib/observability';

interface PrivacySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Derechos RGPD: acceso a los datos (art. 20) y supresión (art. 17).
 *
 * Es obligatorio en la UE y no existía ni endpoint ni interfaz.
 */
const PrivacySheet: React.FC<PrivacySheetProps> = ({ open, onOpenChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (open) void privacyService.getMyConsents().then(setConsents);
  }, [open]);

  const consentFor = (document: string) => consents.find((c) => c.document === document);

  const exportData = async () => {
    setIsExporting(true);
    try {
      await privacyService.downloadMyData();
      toast({ title: t('privacy.exported') });
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const deleteAccount = async () => {
    setIsDeleting(true);
    try {
      await privacyService.deleteMyAccount();
      track('account_deleted');
      toast({ title: t('privacy.deleted'), description: t('privacy.deletedBody') });
      navigate('/', { replace: true });
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
      setIsDeleting(false);
    }
  };

  const keyword = t('privacy.deleteKeyword');

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-party-primary" />
              {t('privacy.title')}
            </SheetTitle>
            <SheetDescription>{t('consent.readDocs')}</SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-4">
            {/* Documentos legales */}
            <div>
              <p className="font-medium mb-3">{t('privacy.documents')}</p>
              <div className="space-y-2">
                {(['terms', 'privacy'] as const).map((doc) => {
                  const record = consentFor(doc);
                  return (
                    <Link
                      key={doc}
                      to={`/legal/${doc}`}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted"
                    >
                      <span className="flex items-center gap-2">
                        <FileText size={16} className="text-party-gray" />
                        {t(doc === 'terms' ? 'privacy.termsLink' : 'privacy.privacyLink')}
                      </span>
                      {record && (
                        <span className="text-xs text-party-gray">
                          {t('privacy.consentGiven', {
                            date: new Date(record.acceptedAt).toLocaleDateString(),
                          })}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Exportación */}
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium mb-1">{t('privacy.exportTitle')}</p>
              <p className="text-sm text-party-gray mb-3">{t('privacy.exportBody')}</p>
              <PartyButton
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void exportData()}
                disabled={isExporting}
              >
                <Download size={14} className="mr-2" />
                {isExporting ? t('privacy.exporting') : t('privacy.export')}
              </PartyButton>
            </div>

            {/* Borrado */}
            <div className="rounded-lg border border-destructive/40 p-4">
              <p className="font-medium mb-1">{t('privacy.deleteTitle')}</p>
              <p className="text-sm text-party-gray mb-3">{t('privacy.deleteBody')}</p>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 size={14} className="mr-2" />
                {t('privacy.delete')}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('privacy.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('privacy.deleteConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="delete-confirm">{keyword}</Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            {/* No usamos AlertDialogAction para poder deshabilitarlo hasta que
                el texto coincida sin que el diálogo se cierre solo. */}
            <Button
              variant="destructive"
              disabled={confirmText.trim().toUpperCase() !== keyword.toUpperCase() || isDeleting}
              onClick={() => void deleteAccount()}
            >
              {t('privacy.deleteConfirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PrivacySheet;
