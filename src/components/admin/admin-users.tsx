import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Minus, Plus, Search, ShieldCheck, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { adminService, AdminUser } from '@/services/admin';
import { cn } from '@/lib/utils';
import AdminNotices from '@/components/admin/admin-notices';

const PAGINA = 50;

/**
 * Todas las cuentas de personas: quién es, qué suscripción tiene y cuántos
 * supercrush le quedan.
 *
 * La suscripción se cambia con el desplegable de la fila y los supercrush con
 * los botones de − y +. Las dos cosas las aplica la base de datos, que
 * comprueba que quien llama es administración.
 */
const AdminUsers = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [busqueda, setBusqueda] = useState('');
  const [usuarios, setUsuarios] = useState<AdminUser[]>([]);
  const [cargando, setCargando] = useState(true);
  const [pagina, setPagina] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Tocar una tarjeta la abre; sólo una a la vez.
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(
    async (texto: string, page: number) => {
      setCargando(true);
      try {
        setUsuarios(await adminService.listUsers(texto, PAGINA, page * PAGINA));
      } catch {
        toast({ title: t('common.error'), variant: 'destructive' });
      } finally {
        setCargando(false);
      }
    },
    [toast, t],
  );

  // Se espera medio segundo a que se deje de escribir.
  useEffect(() => {
    const id = window.setTimeout(() => void cargar(busqueda, pagina), 400);
    return () => window.clearTimeout(id);
  }, [busqueda, pagina, cargar]);

  const total = usuarios[0]?.total ?? 0;

  const cambiarPlan = async (user: AdminUser, valor: string) => {
    setOcupado(user.profileId);
    try {
      await adminService.setSubscription(user.profileId, valor as 'none' | 'monthly' | 'lifetime');
      setUsuarios((prev) =>
        prev.map((u) =>
          u.profileId === user.profileId ? { ...u, subscription: valor as AdminUser['subscription'] } : u,
        ),
      );
      toast({ title: t('admin.users.planSaved') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const sumarSupercrush = async (user: AdminUser, delta: number) => {
    setOcupado(user.profileId);
    try {
      const saldo = await adminService.addSupercrush(user.profileId, delta);
      setUsuarios((prev) => prev.map((u) => (u.profileId === user.profileId ? { ...u, supercrush: saldo } : u)));
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="space-y-3">
      <AdminNotices kind="user" />
      <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 text-ink">
        <Search size={17} className="shrink-0 text-ink/50" />
        <Input
          value={busqueda}
          onChange={(e) => {
            setPagina(0);
            setBusqueda(e.target.value);
          }}
          placeholder={t('admin.users.search')}
          className="h-full border-0 bg-transparent px-0 text-ink placeholder:text-ink/40 focus-visible:ring-0"
        />
      </label>

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
        </div>
      ) : usuarios.length === 0 ? (
        <p className="py-10 text-center text-body-sm text-party-gray">{t('admin.users.empty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {usuarios.map((user) => {
            const expandida = abierto === user.profileId;
            return (
              <li
                key={user.profileId}
                className={cn(
                  'rounded-2xl bg-white p-3 text-ink transition-shadow',
                  expandida && 'col-span-2 shadow-lg sm:col-span-3 lg:col-span-4 xl:col-span-5',
                )}
              >
                {/* Cerrada: sólo nombre, correo y lo imprescindible. */}
                <button
                  type="button"
                  onClick={() => setAbierto(expandida ? null : user.profileId)}
                  className="press w-full text-left"
                >
                  <p className="flex items-center gap-1.5 truncate font-display text-title-card">
                    {user.name}
                    {user.role === 'admin' && <ShieldCheck size={13} className="shrink-0 text-party-primary" />}
                  </p>
                  <p className="truncate text-caption text-ink/60">{user.email ?? '—'}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                        user.subscription === 'none' ? 'bg-black/[0.06] text-ink/60' : 'bg-party-primary text-ink',
                      )}
                    >
                      {t(`admin.users.plans.${user.subscription}`)}
                    </span>
                    <span className="flex items-center gap-0.5 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-ink/60">
                      <Star size={10} className="fill-party-primary text-party-primary" />
                      {user.supercrush}
                    </span>
                  </p>
                </button>

                {expandida && (
                  <div className="mt-3 space-y-3 border-t border-black/[0.06] pt-3">
                    <p className="text-caption text-ink/50">
                      {t('admin.users.meta', {
                        type: t(`accountKind.${user.accountType === 'guest' ? 'guest' : 'vyber'}.tab`),
                        checkIns: user.checkIns,
                        date: new Date(user.createdAt).toLocaleDateString(),
                      })}
                      {user.status !== 'active' ? ` · ${user.status}` : ''}
                      {user.isVerified ? '' : ` · ${t('profile.unverified')}`}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={user.subscription === 'event' ? 'event' : user.subscription}
                        disabled={ocupado === user.profileId || user.subscription === 'event'}
                        onValueChange={(v) => void cambiarPlan(user, v)}
                      >
                        <SelectTrigger className="h-9 w-auto min-w-[9rem] gap-2 rounded-full border-black/10 bg-[#F5F5F7] text-ink">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('admin.users.plans.none')}</SelectItem>
                          <SelectItem value="monthly">{t('admin.users.plans.monthly')}</SelectItem>
                          <SelectItem value="lifetime">{t('admin.users.plans.lifetime')}</SelectItem>
                          {user.subscription === 'event' && (
                            <SelectItem value="event" disabled>
                              {t('admin.users.plans.event')}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      {user.subscriptionExpiresAt && user.subscription !== 'none' && (
                        <span
                          className={cn(
                            'text-caption',
                            user.subscriptionRenews ? 'text-emerald-700' : 'font-bold text-amber-700',
                          )}
                        >
                          {t(
                            user.subscriptionRenews
                              ? 'admin.subs.renews'
                              : user.subscriptionCancelAtPeriodEnd
                                ? 'admin.subs.endsCancelled'
                                : 'admin.subs.ends',
                            { date: new Date(user.subscriptionExpiresAt).toLocaleDateString() },
                          )}
                        </span>
                      )}

                      <span className="ml-auto flex items-center gap-1 rounded-full bg-[#F5F5F7] p-1">
                        <button
                          type="button"
                          onClick={() => void sumarSupercrush(user, -1)}
                          disabled={ocupado === user.profileId || user.supercrush < 1}
                          aria-label={t('supercrush.less')}
                          className="press flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink disabled:opacity-40"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="flex items-center gap-1 px-1 text-body-sm font-bold tabular-nums">
                          <Star size={13} className="fill-party-primary text-party-primary" />
                          {user.supercrush}
                        </span>
                        <button
                          type="button"
                          onClick={() => void sumarSupercrush(user, 1)}
                          disabled={ocupado === user.profileId}
                          aria-label={t('supercrush.more')}
                          className="press flex h-7 w-7 items-center justify-center rounded-full bg-party-primary text-ink disabled:opacity-40"
                        >
                          <Plus size={14} />
                        </button>
                      </span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {total > PAGINA && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
            className="press h-10 rounded-xl bg-white px-4 text-body-sm font-bold text-ink disabled:opacity-40"
          >
            {t('common.back')}
          </button>
          <span className="text-caption text-party-gray">
            {t('admin.users.page', { from: pagina * PAGINA + 1, to: pagina * PAGINA + usuarios.length, total })}
          </span>
          <button
            type="button"
            onClick={() => setPagina((p) => p + 1)}
            disabled={(pagina + 1) * PAGINA >= total}
            className="press h-10 rounded-xl bg-white px-4 text-body-sm font-bold text-ink disabled:opacity-40"
          >
            {t('common.next')}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
