import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { ImagePlus, Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { api, ApiError } from '@/services/api';
import { isNative, pickNativePhoto, platform } from '@/services/native';

const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Reportar error» de Ajustes: título, descripción y una captura opcional.
 * Llega a administración → Reportes (migración 138).
 */
const BugReportDialog = ({ open, onOpenChange }: Props) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const location = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const reset = () => {
    setTitle('');
    setMessage('');
    setImage(null);
  };

  const usarImagen = (blob: Blob) => {
    if (!TIPOS.includes(blob.type)) {
      toast({ title: t('bugReport.imageType'), variant: 'destructive' });
      return;
    }
    if (blob.size > MAX_BYTES) {
      toast({ title: t('bugReport.imageTooBig'), variant: 'destructive' });
      return;
    }
    setImage(blob);
  };

  const elegirImagen = async () => {
    if (!isNative()) {
      fileRef.current?.click();
      return;
    }
    try {
      const dataUrl = await pickNativePhoto();
      if (dataUrl) usarImagen(await (await fetch(dataUrl)).blob());
    } catch {
      // Cancelar el selector no es un error.
    }
  };

  const listo = title.trim().length >= 3 && message.trim().length >= 10;

  const enviar = async () => {
    if (!listo || sending) return;
    setSending(true);
    try {
      await api.submitBugReport({
        title: title.trim(),
        message: message.trim(),
        image,
        context: {
          platform: platform(),
          route: location.pathname,
          language: i18n.language,
          userAgent: navigator.userAgent.slice(0, 300),
          screen: `${window.innerWidth}x${window.innerHeight}`,
        },
      });
      toast({ title: t('bugReport.sent'), description: t('bugReport.sentBody') });
      reset();
      onOpenChange(false);
    } catch (error) {
      const muchos = error instanceof ApiError && error.code === 'TOO_MANY_REPORTS';
      toast({ title: t(muchos ? 'bugReport.tooMany' : 'common.error'), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(abierto) => !sending && onOpenChange(abierto)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('bugReport.title')}</DialogTitle>
          <DialogDescription>{t('bugReport.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="bug-title">{t('bugReport.fieldTitle')}</Label>
            <Input
              id="bug-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('bugReport.fieldTitlePlaceholder')}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bug-message">{t('bugReport.fieldMessage')}</Label>
            <Textarea
              id="bug-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('bugReport.fieldMessagePlaceholder')}
              rows={5}
              maxLength={4000}
            />
            <p className="text-caption text-party-gray">{t('bugReport.fieldMessageHelp')}</p>
          </div>

          <div className="space-y-2">
            <Label>{t('bugReport.image')}</Label>
            {preview ? (
              <div className="relative w-28">
                <img src={preview} alt="" className="h-28 w-28 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label={t('bugReport.removeImage')}
                  className="press absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-white"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void elegirImagen()}
                className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 text-body-sm font-semibold text-party-gray hover:text-foreground"
              >
                <ImagePlus size={18} />
                {t('bugReport.addImage')}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={TIPOS.join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) usarImagen(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void enviar()} disabled={!listo || sending}>
            {sending && <Loader2 size={16} className="mr-2 animate-spin" />}
            {t('bugReport.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BugReportDialog;
