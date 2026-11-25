import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { adminService } from '@/services/admin';
import { ApiError } from '@/services/api';

/**
 * Botón de borrar un negocio o una cuenta desde administración.
 *
 * Pide escribir el nombre para confirmar: no se puede deshacer. En un negocio
 * se puede borrar también la cuenta de quien lo dio de alta (marcado por
 * defecto: casi siempre es una cuenta que sólo existe para el local).
 */
const AdminDeleteButton = ({
  type,
  id,
  name,
  onDeleted,
}: {
  type: 'venue' | 'user';
  id: string;
  name: string;
  onDeleted: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [conDueno, setConDueno] = useState(true);
  const [borrando, setBorrando] = useState(false);

  const coincide = texto.trim().toLowerCase() === name.trim().toLowerCase();

  const borrar = async () => {
    setBorrando(true);
    try {
      await adminService.deleteEntity(type, id, type === 'venue' && conDueno);
      toast({ title: t(`admin.delete.done.${type}`) });
      setAbierto(false);
      onDeleted();
    } catch (error) {
      const codigo = error instanceof ApiError ? error.code : '';
      const conocido = ['VENUE_HAS_SALES', 'HOUSE_VENUE', 'PROTECTED_ACCOUNT', 'APPLE_SUBSCRIPTION_ACTIVE'].includes(codigo);
      toast({
        title: t('admin.delete.failed'),
        description: conocido ? t(`admin.delete.errors.${codigo}`) : undefined,
        variant: 'destructive',
      });
    } finally {
      setBorrando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTexto('');
          setConDueno(true);
          setAbierto(true);
        }}
        className="press flex h-9 items-center gap-1.5 rounded-full bg-red-50 px-3 text-caption font-bold text-red-700"
      >
        <Trash2 size={14} />
        {t(`admin.delete.button.${type}`)}
      </button>

      <AlertDialog open={abierto} onOpenChange={(o) => !borrando && setAbierto(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`admin.delete.title.${type}`, { name })}</AlertDialogTitle>
            <AlertDialogDescription>{t(`admin.delete.body.${type}`)}</AlertDialogDescription>
          </AlertDialogHeader>

          {type === 'venue' && (
            <label className="flex items-start gap-2 text-body-sm">
              <Checkbox checked={conDueno} onCheckedChange={(v) => setConDueno(v === true)} className="mt-0.5" />
              <span>{t('admin.delete.withOwner')}</span>
            </label>
          )}

          <div className="space-y-1.5">
            <p className="text-caption text-muted-foreground">{t('admin.delete.typeName', { name })}</p>
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrando}>{t('common.cancel')}</AlertDialogCancel>
            <Button variant="destructive" disabled={!coincide || borrando} onClick={() => void borrar()}>
              {borrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('admin.delete.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminDeleteButton;
