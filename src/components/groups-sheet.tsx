import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Copy, LogOut, Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { socialService, Group } from '@/services/social';
import { ApiError } from '@/services/api';
import { track } from '@/lib/observability';
import { eventActionClass } from '@/components/ui-custom/event-action-button';
import GroupChat from '@/components/group-chat';
import { useAppContext } from '@/context/app-context';
import { usePremium } from '@/context/premium-context';
import { Crown, Info } from 'lucide-react';

interface GroupsSheetProps {
  eventId: string;
}

const FALLBACK_AVATAR = '/placeholder.svg';

/**
 * Salir de fiesta es una actividad de grupo y ninguna app grande lo resuelve
 * bien: aquí puedes crear uno, compartir el código y ver los demás grupos.
 */
const GroupsSheet: React.FC<GroupsSheetProps> = ({ eventId }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentUser, activeEvent } = useAppContext();
  const { isPremium, setShowPremiumDialog } = usePremium();

  const [open, setOpen] = useState(false);
  const [myGroup, setMyGroup] = useState<{ id: string; code: string } | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    const [mine, all] = await Promise.all([
      socialService.getMyGroup(eventId),
      socialService.getEventGroups(eventId),
    ]);
    setMyGroup(mine);
    setGroups(all);
  }, [eventId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleError = (error: unknown) => {
    const key = error instanceof ApiError ? error.message : 'errors.generic';
    toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
  };

  const create = async () => {
    if (!groupName.trim()) return;

    // Se avisa antes de llamar al servidor: la función también lo comprueba,
    // pero un error rojo es peor explicación que el propio panel de Premium.
    if (!isPremium) {
      setShowPremiumDialog(true);
      return;
    }

    setIsBusy(true);
    try {
      await socialService.createGroup(eventId, groupName.trim());
      setGroupName('');
      await load();
      track('swipe', { action: 'group_created' });
      toast({ title: t('groups.created') });
    } catch (error) {
      handleError(error);
    } finally {
      setIsBusy(false);
    }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setIsBusy(true);
    try {
      await socialService.joinGroup(joinCode.trim());
      setJoinCode('');
      await load();
      toast({ title: t('groups.joined') });
    } catch (error) {
      handleError(error);
    } finally {
      setIsBusy(false);
    }
  };

  const leave = async () => {
    if (!myGroup) return;
    setIsBusy(true);
    try {
      await socialService.leaveGroup(myGroup.id);
      await load();
      toast({ title: t('groups.left') });
    } catch (error) {
      handleError(error);
    } finally {
      setIsBusy(false);
    }
  };

  const copyCode = async () => {
    if (!myGroup) return;
    await navigator.clipboard.writeText(myGroup.code);
    toast({ title: t('venue.qr.copied') });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={eventActionClass} aria-label={t('swiping.groups')}>
        <Users size={20} />
        <span className="whitespace-nowrap">{t('swiping.groups')}</span>
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>{t('groups.title')}</SheetTitle>
          <SheetDescription>{t('groups.subtitle')}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Qué es un grupo. Sin esto, la pantalla pedía un nombre y un código
              sin explicar nunca para qué. */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Info size={14} className="text-party-primary shrink-0" />
              {t('groups.whatTitle')}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              <li>{t('groups.whatChat')}</li>
              <li>{t('groups.whatFind')}</li>
              <li>{t('groups.whatExpire')}</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              {t('groups.whatPlans')}
            </p>
          </div>

          {myGroup ? (
            <div className="rounded-lg border border-party-primary p-4">
              <p className="text-sm text-party-gray mb-2">{t('groups.shareCode')}</p>
              <div className="flex items-center gap-2 mb-4">
                <p className="text-2xl font-bold tracking-widest text-party-primary">
                  {myGroup.code}
                </p>
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="text-party-gray"
                  aria-label={t('venue.qr.share')}
                >
                  <Copy size={16} />
                </button>
              </div>
              <GroupChat
                groupId={myGroup.id}
                myProfileId={currentUser?.id ?? null}
                eventEndDate={activeEvent?.endDate}
              />

              <PartyButton
                variant="outline"
                size="sm"
                className="w-full mt-4"
                onClick={() => void leave()}
                disabled={isBusy}
              >
                <LogOut size={14} className="mr-2" />
                {t('groups.leave')}
              </PartyButton>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="group-name" className="flex items-center gap-1.5">
                  {t('groups.groupName')}
                  {!isPremium && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-normal text-party-accent">
                      <Crown size={11} />
                      {t('groups.createIsPremium')}
                    </span>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="group-name"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={t('groups.groupNamePlaceholder')}
                    maxLength={40}
                  />
                  <PartyButton size="sm" onClick={() => void create()} disabled={isBusy}>
                    <Plus size={14} />
                  </PartyButton>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="join-code">{t('groups.joinCode')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="join-code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder={t('groups.joinCodePlaceholder')}
                    maxLength={6}
                    className="tracking-widest"
                  />
                  <PartyButton
                    size="sm"
                    variant="outline"
                    onClick={() => void join()}
                    disabled={isBusy}
                  >
                    {t('groups.join')}
                  </PartyButton>
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="font-medium mb-3">{t('groups.otherGroups')}</p>

            {groups.filter((g) => !g.isMine).length === 0 ? (
              <p className="text-sm text-party-gray">{t('groups.noGroups')}</p>
            ) : (
              <ul className="space-y-2">
                {groups
                  .filter((g) => !g.isMine)
                  .map((group) => (
                    <li
                      key={group.groupId}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted"
                    >
                      <div className="flex -space-x-2">
                        {group.avatars.slice(0, 3).map((avatar, index) => (
                          <img
                            key={index}
                            src={avatar || FALLBACK_AVATAR}
                            alt=""
                            className="w-8 h-8 rounded-full border-2 border-background object-cover"
                          />
                        ))}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{group.name}</p>
                        <p className="text-xs text-party-gray">
                          {t('groups.members', { count: group.memberCount })}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default GroupsSheet;
