import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { venueService, VenueMember, VenueRole } from '@/services/venue-service';
import { ApiError } from '@/services/api';

interface VenueTeamProps {
  venueId: string;
  role: VenueRole | null;
}

const ROLES: VenueRole[] = ['staff', 'marketing', 'owner'];

/**
 * Equipo del local.
 *
 * Un local necesita más de una cuenta: el dueño, la puerta y marketing tienen
 * necesidades distintas y no deberían compartir credenciales.
 */
const VenueTeam: React.FC<VenueTeamProps> = ({ venueId, role }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [members, setMembers] = useState<VenueMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<VenueRole>('staff');
  const [isBusy, setIsBusy] = useState(false);

  const isOwner = role === 'owner';

  const load = useCallback(async () => {
    setIsLoading(true);
    setMembers(await venueService.getMembers(venueId));
    setIsLoading(false);
  }, [venueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setIsBusy(true);
    try {
      await venueService.addMember(venueId, email.trim(), newRole);
      setEmail('');
      await load();
      toast({ title: t('venue.team.added') });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
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

  // «Equipo» de Stitch: los miembros en una tarjeta blanca, con el rol en una
  // etiqueta (amarilla la del propietario) y la invitación en otra.
  return (
    <div className="space-y-4">
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
              placeholder="staff@ejemplo.com"
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
                {ROLES.map((r) => (
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
    </div>
  );
};

export default VenueTeam;
