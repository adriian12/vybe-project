import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, UserMinus, Crown, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { socialService, GroupMessage, GroupMember } from '@/services/social';
import { ApiError } from '@/services/api';

interface GroupChatProps {
  groupId: string;
  /** Perfil de quien mira, para alinear sus mensajes a la derecha. */
  myProfileId: string | null;
  /** Cuándo termina el evento: es cuando se borra la conversación. */
  eventEndDate?: string;
}

const FALLBACK_AVATAR = '/placeholder.svg';

/**
 * Conversación del grupo.
 *
 * Hasta ahora un grupo se creaba, se veía en una lista y ahí acababa: no había
 * nada que hacer con él. Aquí es donde el grupo sirve para algo —quedar en la
 * barra, avisar de que salís fuera— y por eso el mensaje llega en el momento,
 * por Realtime, y no cuando alguien recarga.
 *
 * La conversación desaparece unas horas después del evento, igual que el chat
 * de un match: lo que se dice en una fiesta no tiene por qué quedarse.
 */
const GroupChat = ({ groupId, myProfileId, eventEndDate }: GroupChatProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const bottom = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const [msgs, mems] = await Promise.all([
      socialService.getGroupMessages(groupId),
      socialService.getGroupMembers(groupId),
    ]);
    setMessages(msgs);
    setMembers(mems);
    setIsLoading(false);
  }, [groupId]);

  useEffect(() => {
    void load();
    // Realtime: un aviso de «salimos fuera» que llega media hora tarde no vale.
    return socialService.subscribeToGroupMessages(groupId, () => void load());
  }, [groupId, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const iAmOwner = members.some((m) => m.isOwner && m.profileId === myProfileId);

  const send = async () => {
    const content = draft.trim();
    if (!content) return;

    setIsSending(true);
    try {
      await socialService.sendGroupMessage(groupId, content);
      setDraft('');
      await load();
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const remove = async (profileId: string, name: string) => {
    try {
      await socialService.removeGroupMember(groupId, profileId);
      await load();
      toast({ title: t('groups.removed', { name }) });
    } catch (error) {
      const key = error instanceof ApiError ? error.message : 'errors.generic';
      toast({ title: t('common.error'), description: t(key), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      {/* Quién está en el grupo. Quien lo creó puede echar a alguien. */}
      <div className="flex flex-wrap gap-2">
        {members.map((member) => (
          <div
            key={member.profileId}
            className="flex items-center gap-1.5 rounded-full bg-muted pl-1 pr-2 py-1"
          >
            <img
              src={member.photo || FALLBACK_AVATAR}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
            />
            <span className="text-xs font-medium max-w-24 truncate">{member.name}</span>
            {member.isOwner && <Crown size={11} className="text-party-accent shrink-0" />}
            {iAmOwner && !member.isOwner && (
              <button
                type="button"
                onClick={() => void remove(member.profileId, member.name)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={t('groups.remove', { name: member.name })}
              >
                <UserMinus size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="h-56 overflow-y-auto rounded-lg border border-border bg-muted/60 p-3 space-y-2">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-party-primary" />
          </div>
        ) : messages.length === 0 ? (
          <p className="h-full flex items-center justify-center text-center text-xs text-muted-foreground px-4">
            {t('groups.chatEmpty')}
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.profileId === myProfileId;
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-1.5 ${
                    mine
                      ? 'bg-party-primary text-party-dark rounded-br-sm'
                      : 'bg-background rounded-bl-sm'
                  }`}
                >
                  {!mine && (
                    <p className="text-[11px] font-semibold text-party-primary leading-tight">
                      {message.authorName}
                    </p>
                  )}
                  <p className="text-sm break-words">{message.content}</p>
                  <p className={`text-[10px] ${mine ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {new Date(message.createdAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('groups.chatPlaceholder')}
          maxLength={500}
        />
        <PartyButton type="submit" size="sm" disabled={isSending || !draft.trim()}>
          <Send size={14} />
        </PartyButton>
      </form>

      {eventEndDate && (
        <p className="text-[11px] text-muted-foreground text-center">
          {t('groups.chatExpires', {
            time: new Date(eventEndDate).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })}
        </p>
      )}
    </div>
  );
};

export default GroupChat;
