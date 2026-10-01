import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/app-context';
import { ReportType } from '@/types/user';

interface ReportUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

const REPORT_REASONS: ReportType[] = [
  'inappropriate_content',
  'harassment',
  'fake_profile',
  'spam',
  'other',
];

/**
 * Reportar y bloquear existían en la API pero no había forma de usarlos desde
 * la interfaz. Este diálogo cierra ese hueco.
 */
const ReportUserDialog: React.FC<ReportUserDialogProps> = ({
  isOpen,
  onClose,
  userId,
  userName,
}) => {
  const { t } = useTranslation();
  const { reportUser, blockUser } = useAppContext();

  const [reason, setReason] = useState<ReportType>('inappropriate_content');
  const [description, setDescription] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setReason('inappropriate_content');
    setDescription('');
    setAlsoBlock(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await reportUser(userId, reason, description.trim() || undefined);
      if (alsoBlock) await blockUser(userId);
      reset();
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('report.title', { name: userName })}</DialogTitle>
          <DialogDescription>
            {t('report.subtitle')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup value={reason} onValueChange={(value) => setReason(value as ReportType)}>
            {REPORT_REASONS.map((option) => (
              <div key={option} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`reason-${option}`} />
                <Label htmlFor={`reason-${option}`} className="font-normal">
                  {t(`report.reasons.${option}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="report-description">{t('report.details')}</Label>
            <Textarea
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('report.detailsPlaceholder')}
              rows={3}
              maxLength={500}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alsoBlock}
              onChange={(e) => setAlsoBlock(e.target.checked)}
              className="rounded border-border"
            />
            {t('report.alsoBlock', { name: userName })}
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('report.submitting') : t('report.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportUserDialog;
