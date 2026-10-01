import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, Loader2, Megaphone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { adminService } from '@/services/admin';

/**
 * Botones de aviso encima del buscador de usuarios o de locales.
 *
 *   · «Caduca pronto»: avisa a quien tiene la suscripción a punto de caducar y
 *     no se renueva sola (la canceló, es una prueba o la dio administración).
 *     Quien renueva sola no recibe nada, y a nadie se le avisa dos veces de la
 *     misma fecha.
 *   · «Enviar novedad»: un mensaje a todos (push a usuarios, correo a locales).
 */
const AdminNotices = ({ kind }: { kind: 'user' | 'venue' }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [novedad, setNovedad] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = () =>
    adminService
      .notify<{ users: number; venues: number }>({ action: 'preview' })
      .then((r) => setPendientes(kind === 'user' ? r.users : r.venues))
      .catch(() => setPendientes(null));

  useEffect(() => {
    void cargar();
    // Sólo al abrir la sección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const enviarCaducidad = async () => {
    setBusy(true);
    try {
      const r = await adminService.notify<{ sent: number; total: number }>({ action: 'expiring', kind });
      toast({ title: t('admin.notices.sent', { count: r.sent }) });
      setConfirmar(false);
      void cargar();
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const enviarNovedad = async () => {
    setBusy(true);
    try {
      const r = await adminService.notify<{ sent?: number; queued?: boolean }>({
        action: 'update',
        kind,
        title: titulo.trim(),
        body: cuerpo.trim(),
      });
      toast({ title: r.queued ? t('admin.notices.queued') : t('admin.notices.sent', { count: r.sent ?? 0 }) });
      setNovedad(false);
      setTitulo('');
      setCuerpo('');
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const boton =
    'press flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-caption font-bold text-ink disabled:opacity-50';

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={boton} onClick={() => setConfirmar(true)} disabled={!pendientes}>
        <BellRing size={14} />
        {t('admin.notices.expiring')}
        <span className="rounded-full bg-black/[0.08] px-1.5 text-[11px]">{pendientes ?? '…'}</span>
      </button>
      <button type="button" className={boton} onClick={() => setNovedad(true)}>
        <Megaphone size={14} />
        {t('admin.notices.update')}
      </button>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent className="surface-light !bg-white text-ink sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>{t('admin.notices.expiringTitle', { count: pendientes ?? 0 })}</DialogTitle>
            <DialogDescription className="text-ink/60">
              {t(kind === 'user' ? 'admin.notices.expiringBodyUsers' : 'admin.notices.expiringBodyVenues')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setConfirmar(false)} className="press h-10 rounded-xl border border-black/15 px-4 font-bold">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void enviarCaducidad()}
              className="press flex h-10 items-center gap-1.5 rounded-xl bg-party-primary px-4 font-bold text-ink disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {t('admin.notices.send')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={novedad} onOpenChange={setNovedad}>
        <DialogContent className="surface-light !bg-white text-ink sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>{t(kind === 'user' ? 'admin.notices.updateUsers' : 'admin.notices.updateVenues')}</DialogTitle>
            <DialogDescription className="text-ink/60">
              {t(kind === 'user' ? 'admin.notices.updateUsersBody' : 'admin.notices.updateVenuesBody')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={titulo}
              maxLength={80}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={t('admin.notices.titlePlaceholder')}
              aria-label={t('admin.notices.titlePlaceholder')}
            />
            <Textarea
              value={cuerpo}
              maxLength={kind === 'user' ? 200 : 2000}
              rows={kind === 'user' ? 3 : 6}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder={t('admin.notices.bodyPlaceholder')}
              aria-label={t('admin.notices.bodyPlaceholder')}
            />
          </div>
          <DialogFooter className="gap-2">
            <button type="button" onClick={() => setNovedad(false)} className="press h-10 rounded-xl border border-black/15 px-4 font-bold">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={busy || !titulo.trim() || !cuerpo.trim()}
              onClick={() => void enviarNovedad()}
              className="press flex h-10 items-center gap-1.5 rounded-xl bg-party-primary px-4 font-bold text-ink disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {t('admin.notices.send')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminNotices;
