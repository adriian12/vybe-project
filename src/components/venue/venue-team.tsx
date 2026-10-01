import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Link2, Loader2, Plus, Trash2, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import ShareLink from '@/components/team/share-link';
import { venueService, VenueMember, VenueRole } from '@/services/venue-service';
import { CommissionType, isLinkAlive, TeamLink, TeamLinkRole, teamLinkUrl, teamService } from '@/services/team';
import { ApiError } from '@/services/api';
import type { Event as VybeEvent } from '@/types/venue';

interface VenueTeamProps {
  venueId: string;
  role: VenueRole | null;
  /** Fiestas del local, para atar a una noche los enlaces de Seguridad y Camareros. */
  events: VybeEvent[];
  /** Business: la comisión de cada RRPP. */
  canCommission: boolean;
}

const ACCOUNT_ROLES: VenueRole[] = ['security', 'owner'];
const LINK_ROLES: TeamLinkRole[] = ['security', 'waiter', 'promoter'];

const fecha = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Equipo del local (migración 072).
 *
 *   · Cuentas: propietarios (todo el panel) y Seguridad (Puerta y Código QR),
 *     con su propia cuenta.
 *   · Enlaces, sin cuenta: Seguridad y Camareros para una noche, RRPP fijo
 *     hasta que se revoca. Se abren en `/equipo/<token>`.
 */
const VenueTeam: React.FC<VenueTeamProps> = ({ venueId, role, events, canCommission }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [members, setMembers] = useState<VenueMember[]>([]);
  const [links, setLinks] = useState<TeamLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<VenueRole>('security');
  const [isBusy, setIsBusy] = useState(false);

  // Enlace nuevo
  const [creando, setCreando] = useState(false);
  const [linkRole, setLinkRole] = useState<TeamLinkRole>('security');
  const [linkName, setLinkName] = useState('');
  const [linkEvent, setLinkEvent] = useState('');
  const [commissionType, setCommissionType] = useState<CommissionType | 'none'>('none');
  const [commissionValue, setCommissionValue] = useState('');
  const [viendo, setViendo] = useState<{ label: string; role: TeamLinkRole; token: string } | null>(null);

  const isOwner = role === 'owner';

  const fail = useCallback(
    (error: unknown) => {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    },
    [t, toast],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    const [miembros, enlaces] = await Promise.all([
      venueService.getMembers(venueId),
      isOwner ? teamService.listLinks().catch(() => [] as TeamLink[]) : Promise.resolve([] as TeamLink[]),
    ]);
    setMembers(miembros);
    setLinks(enlaces);
    setIsLoading(false);
  }, [venueId, isOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Fiestas a las que se puede atar un enlace de una noche: las que no han terminado. */
  const proximas = useMemo(
    () =>
      events
        .filter((e) => new Date(e.endDate).getTime() > Date.now())
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [events],
  );

  useEffect(() => {
    if (!linkEvent && proximas[0]) setLinkEvent(proximas[0].id);
  }, [proximas, linkEvent]);

  const add = async () => {
    setIsBusy(true);
    try {
      await venueService.addMember(venueId, email.trim(), newRole);
      setEmail('');
      await load();
      toast({ title: t('venue.team.added') });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async (member: VenueMember) => {
    if (member.role === 'owner') {
      toast({ title: t('venue.team.cannotRemoveOwner'), variant: 'destructive' });
      return;
    }

    try {
      await venueService.removeMember(member.id);
      await load();
      toast({ title: t('venue.team.removed') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const nocturno = linkRole !== 'promoter';
  const puedeCrear = linkName.trim().length > 0 && (!nocturno || Boolean(linkEvent));

  const crearEnlace = async () => {
    setIsBusy(true);
    try {
      const conComision = linkRole === 'promoter' && canCommission && commissionType !== 'none';
      const token = await teamService.createLink({
        role: linkRole,
        label: linkName.trim(),
        eventId: nocturno ? linkEvent : null,
        commissionType: conComision ? (commissionType as CommissionType) : null,
        commissionValue: conComision ? Number(commissionValue.replace(',', '.')) || 0 : null,
      });
      setViendo({ label: linkName.trim(), role: linkRole, token });
      setLinkName('');
      setCommissionValue('');
      setCommissionType('none');
      setCreando(false);
      await load();
      toast({ title: t('venue.team.links.created') });
    } catch (error) {
      fail(error);
    } finally {
      setIsBusy(false);
    }
  };

  const revocar = async (link: TeamLink) => {
    if (!window.confirm(t('venue.team.links.revokeConfirm', { name: link.label }))) return;
    try {
      await teamService.revokeLink(link.id);
      await load();
      toast({ title: t('venue.team.links.revoked') });
    } catch (error) {
      fail(error);
    }
  };

  const estado = (link: TeamLink) => {
    if (link.revokedAt) return t('venue.team.links.revokedTag');
    if (!isLinkAlive(link)) return t('venue.team.links.expired');
    const uso = link.lastUsedAt ? t('venue.team.links.lastUsed', { time: fecha(link.lastUsedAt) }) : t('venue.team.links.neverUsed');
    return link.expiresAt ? `${t('venue.team.links.until', { date: fecha(link.expiresAt) })} · ${uso}` : `${t('venue.team.links.forever')} · ${uso}`;
  };

  const comision = (link: TeamLink) =>
    link.commissionType === 'per_person'
      ? t('team.promoter.perPerson', { value: link.commissionValue })
      : link.commissionType === 'percent'
        ? t('team.promoter.percent', { value: link.commissionValue })
        : null;

  // «Equipo» de Stitch: los miembros en una tarjeta blanca, con el rol en una
  // etiqueta (amarilla la del propietario) y la invitación en otra.
  return (
    <div className="space-y-4">
      {/* --------------------------------------------------------- cuentas */}
      <section className="surface-light rounded-2xl p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="font-display text-title-card uppercase tracking-wide">{t('venue.team.members')}</h3>
          {!isLoading && (
            <span className="text-caption text-party-gray">{t('venue.team.count', { count: members.length })}</span>
          )}
        </div>
        <p className="mb-2 text-caption text-party-gray">{t('venue.team.subtitle')}</p>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
          </div>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {members.map((member) => {
              const nombre = member.email ?? member.userId;
              const propietario = member.role === 'owner';
              return (
                <li key={member.id} className="flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-caption font-extrabold uppercase',
                      propietario ? 'bg-ink text-party-primary' : 'bg-black/[0.07] text-ink',
                    )}
                  >
                    {nombre.slice(0, 2)}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-body-md font-bold">{nombre}</p>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-0.5 text-caption font-bold',
                      propietario ? 'bg-party-primary text-ink' : 'bg-black/[0.07] text-ink/70',
                    )}
                  >
                    {t(`venue.team.roles.${member.role}`)}
                  </span>
                  {isOwner && !propietario ? (
                    <button
                      type="button"
                      onClick={() => void remove(member)}
                      className="press shrink-0 text-party-gray hover:text-destructive"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isOwner ? (
        <section className="surface-light space-y-3 rounded-2xl p-4">
          <h3 className="font-display text-title-card uppercase tracking-wide">{t('venue.team.invite')}</h3>

          <div className="space-y-2">
            <Label htmlFor="member-email">{t('venue.team.inviteEmail')}</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seguridad@ejemplo.com"
            />
            <p className="text-xs text-party-gray">{t('venue.team.inviteHelp')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-role">{t('venue.team.role')}</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as VenueRole)}>
              <SelectTrigger id="member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`venue.team.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="rounded-lg bg-black/[0.04] p-3 text-caption text-party-gray">{t('venue.team.roleHelp')}</p>
          </div>

          <PartyButton className="w-full" onClick={() => void add()} disabled={isBusy || !email.trim()}>
            <UserPlus size={16} />
            {t('venue.team.add')}
          </PartyButton>
        </section>
      ) : (
        <p className="rounded-2xl bg-card p-4 text-body-sm text-party-gray">{t('venue.team.onlyOwner')}</p>
      )}

      {/* --------------------------------------------------------- enlaces */}
      {isOwner && (
        <section className="surface-light space-y-3 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
              <Link2 size={17} className="text-party-primary" />
              {t('venue.team.links.title')}
            </h3>
            {!creando && (
              <button
                type="button"
                onClick={() => setCreando(true)}
                className="press flex h-9 items-center gap-1 rounded-lg bg-party-primary px-3 text-caption font-bold text-ink"
              >
                <Plus size={14} />
                {t('venue.team.links.new')}
              </button>
            )}
          </div>
          <p className="text-caption text-party-gray">{t('venue.team.links.body')}</p>

          {creando && (
            <div className="space-y-3 rounded-xl bg-black/[0.03] p-3">
              <div className="grid grid-cols-3 gap-1.5">
                {LINK_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setLinkRole(r)}
                    className={cn(
                      'press h-10 rounded-lg text-caption font-bold uppercase',
                      linkRole === r ? 'bg-ink text-white' : 'bg-white text-ink/70',
                    )}
                  >
                    {t(`venue.team.roles.${r}`)}
                  </button>
                ))}
              </div>
              <p className="text-caption text-party-gray">{t(`venue.team.links.roleHelp.${linkRole}`)}</p>

              <div className="space-y-1">
                <Label htmlFor="link-name" className="text-caption">
                  {t('venue.team.links.name')}
                </Label>
                <Input
                  id="link-name"
                  value={linkName}
                  maxLength={40}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder={t('venue.team.links.namePlaceholder')}
                />
              </div>

              {nocturno && (
                <div className="space-y-1">
                  <Label htmlFor="link-event" className="text-caption">
                    {t('venue.team.links.event')}
                  </Label>
                  {proximas.length === 0 ? (
                    <p className="text-caption text-destructive">{t('venue.team.links.noEvents')}</p>
                  ) : (
                    <Select value={linkEvent} onValueChange={setLinkEvent}>
                      <SelectTrigger id="link-event">
                        <SelectValue placeholder={t('venue.team.links.pickEvent')} />
                      </SelectTrigger>
                      <SelectContent>
                        {proximas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.name} · {fecha(e.startDate)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {linkRole === 'promoter' && canCommission && (
                <div className="space-y-1">
                  <Label className="text-caption">{t('venue.team.links.commission')}</Label>
                  <div className="flex gap-2">
                    <Select value={commissionType} onValueChange={(v) => setCommissionType(v as CommissionType | 'none')}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('venue.team.links.commissionNone')}</SelectItem>
                        <SelectItem value="per_person">{t('venue.team.links.perPerson')}</SelectItem>
                        <SelectItem value="percent">{t('venue.team.links.percent')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {commissionType !== 'none' && (
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.5"
                        value={commissionValue}
                        onChange={(e) => setCommissionValue(e.target.value)}
                        className="w-24"
                        aria-label={t('venue.team.links.commission')}
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <PartyButton variant="outline" className="flex-1" onClick={() => setCreando(false)}>
                  {t('common.cancel')}
                </PartyButton>
                <PartyButton className="flex-1" disabled={isBusy || !puedeCrear} onClick={() => void crearEnlace()}>
                  {isBusy && <Loader2 size={15} className="animate-spin" />}
                  {t('venue.team.links.create')}
                </PartyButton>
              </div>
            </div>
          )}

          {!isLoading && links.length === 0 && !creando && (
            <p className="py-2 text-center text-body-sm text-party-gray">{t('venue.team.links.empty')}</p>
          )}

          <ul className="divide-y divide-black/[0.06]">
            {links.map((link) => {
              const vivo = isLinkAlive(link);
              return (
                <li key={link.id} className={cn('flex items-center gap-3 py-3', !vivo && 'opacity-50')}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-body-md font-bold">
                      <span className="truncate">{link.label}</span>
                      <span className="shrink-0 rounded-md bg-black/[0.07] px-2 py-0.5 text-caption font-bold text-ink/70">
                        {t(`venue.team.roles.${link.role}`)}
                      </span>
                    </p>
                    <p className="truncate text-caption text-party-gray">
                      {link.eventName ? `${link.eventName} · ` : ''}
                      {comision(link) ? `${comision(link)} · ` : ''}
                      {estado(link)}
                    </p>
                  </div>
                  {vivo && (
                    <>
                      <button
                        type="button"
                        onClick={() => setViendo({ label: link.label, role: link.role, token: link.token })}
                        className="press flex h-9 shrink-0 items-center gap-1 rounded-lg border border-black/15 px-2.5 text-caption font-bold"
                      >
                        <Eye size={14} />
                        {t('venue.team.links.view')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void revocar(link)}
                        className="press h-9 shrink-0 rounded-lg px-2 text-caption font-bold text-destructive"
                      >
                        {t('venue.team.links.revoke')}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Dialog open={Boolean(viendo)} onOpenChange={(open) => !open && setViendo(null)}>
        <DialogContent className="surface-light !bg-white text-ink sm:max-w-sm">
          {viendo && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">
                  {viendo.label} · {t(`venue.team.roles.${viendo.role}`)}
                </DialogTitle>
                <DialogDescription className="text-party-gray">{t(`venue.team.links.roleHelp.${viendo.role}`)}</DialogDescription>
              </DialogHeader>
              <ShareLink
                value={teamLinkUrl(viendo.token)}
                whatsappText={t('venue.team.links.whatsappText', {
                  role: t(`venue.team.roles.${viendo.role}`),
                  app: t('common.appName'),
                  url: teamLinkUrl(viendo.token),
                })}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VenueTeam;
