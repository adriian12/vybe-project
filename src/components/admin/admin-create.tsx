import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Mail, Store, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { adminService } from '@/services/admin';
import { cn } from '@/lib/utils';

interface AdminCreateProps {
  /** Para refrescar la lista de debajo cuando se crea algo. */
  onCreated?: () => void;
}

/**
 * Alta de cuentas desde administración: nombre y correo, nada más.
 *
 * No se pide contraseña a propósito: la cuenta se crea y a esa dirección le
 * llega un enlace para elegirla. Así administración nunca ve la contraseña de
 * nadie y el correo sirve además para comprobar que la dirección existe.
 */
const AdminCreate = ({ onCreated }: AdminCreateProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [tipo, setTipo] = useState<'user' | 'venue'>('user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);

  const crear = async () => {
    setEnviando(true);
    try {
      const { emailSent } = await adminService.createAccount(tipo, name.trim(), email.trim());
      setName('');
      setEmail('');
      onCreated?.();
      toast({
        title: t(tipo === 'venue' ? 'admin.create.venueDone' : 'admin.create.userDone'),
        description: t(emailSent ? 'admin.create.mailSent' : 'admin.create.mailFailed'),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const conocidos: Record<string, string> = {
        EMAIL_TAKEN: 'admin.create.emailTaken',
        EMAIL_INVALID: 'admin.create.emailInvalid',
        NAME_REQUIRED: 'admin.create.nameRequired',
      };
      toast({
        title: t('common.error'),
        description: conocidos[code] ? t(conocidos[code]) : t('errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
    }
  };

  const pill = (activo: boolean) =>
    cn(
      'press flex h-10 items-center gap-1.5 rounded-full px-4 text-label-pill',
      activo ? 'bg-party-primary text-ink' : 'bg-black/[0.06] text-ink/70',
    );

  return (
    <section className="rounded-2xl bg-white p-4 text-ink">
      <h3 className="font-display text-title-card uppercase tracking-wide">{t('admin.create.title')}</h3>
      <p className="mb-3 text-caption text-ink/60">{t('admin.create.subtitle')}</p>

      <div className="mb-3 flex gap-2">
        <button type="button" onClick={() => setTipo('user')} className={pill(tipo === 'user')}>
          <UserPlus size={15} />
          {t('admin.create.user')}
        </button>
        <button type="button" onClick={() => setTipo('venue')} className={pill(tipo === 'venue')}>
          <Store size={15} />
          {t('admin.create.venue')}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="alta-nombre" className="text-caption">
            {t('admin.create.name')}
          </Label>
          <Input id="alta-nombre" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="alta-email" className="text-caption">
            {t('admin.create.email')}
          </Label>
          <Input
            id="alta-email"
            type="email"
            value={email}
            maxLength={120}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <PartyButton
          className="h-10 gap-2 self-end"
          disabled={enviando || name.trim().length < 2 || !email.includes('@')}
          onClick={() => void crear()}
        >
          {enviando ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
          {t('admin.create.send')}
        </PartyButton>
      </div>
    </section>
  );
};

export default AdminCreate;
