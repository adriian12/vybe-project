import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Ban,
  Bookmark,
  BookmarkCheck,
  CheckCheck,
  Check,
  Crown,
  Flag,
  Hourglass,
  SendHorizontal,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { useAppContext } from '@/context/app-context';
import ReportUserDialog from './report-user-dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { premiumNight } from '@/services/premium-night';
import { usePremium } from '@/context/premium-context';
import { track } from '@/lib/observability';
import { cn } from '@/lib/utils';
import { Message } from '@/types/user';

interface ChatWindowProps {
  matchId: string;
}

const FALLBACK_PHOTO = '/placeholder.svg';

/** Dos mensajes seguidos de la misma persona con menos de cinco minutos van juntos. */
const MISMO_GRUPO_MS = 5 * 60_000;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** «3h 42m» o «18m» hasta que caduque la conversación. */
const restante = (iso: string): string | null => {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(m, 1)}m`;
};

/**
 * El chat efímero, según «Chat Efímero» de Stitch: la cabecera con quién es y
 * dónde está, el aviso amarillo de que la conversación muere con la fiesta, y
 * burbujas oscuras (lo recibido) y amarillas (lo tuyo) agrupadas.
 */
const ChatWindow: React.FC<ChatWindowProps> = ({ matchId }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();

  const {
    connections,
    messages,
    sendMessage,
    currentUser,
    markMessagesAsRead,
    blockUser,
    refreshConnections,
    activeEvent,
    events,
  } = useAppContext();

  const { isPremium, setShowPremiumDialog } = usePremium();

  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [isKeeping, setIsKeeping] = useState(false);
  const [, forzar] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const connection = connections.find((c) => c.user.id === matchId);
  const match = connection?.user;
  const chatMessages = useMemo(() => messages[matchId] ?? [], [messages, matchId]);

  const sortedMessages = useMemo(
    () =>
      [...chatMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [chatMessages],
  );

  /** Grupos de mensajes seguidos de la misma persona. */
  const grupos = useMemo(() => {
    const lista: { propio: boolean; mensajes: Message[] }[] = [];
    for (const msg of sortedMessages) {
      const propio = msg.senderId === currentUser?.id;
      const anterior = lista[lista.length - 1];
      const ultimo = anterior?.mensajes[anterior.mensajes.length - 1];
      if (
        anterior &&
        anterior.propio === propio &&
        ultimo &&
        new Date(msg.createdAt).getTime() - new Date(ultimo.createdAt).getTime() < MISMO_GRUPO_MS
      ) {
        anterior.mensajes.push(msg);
      } else {
        lista.push({ propio, mensajes: [msg] });
      }
    }
    return lista;
  }, [sortedMessages, currentUser?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sortedMessages.length]);

  // La cuenta atrás del aviso se refresca cada minuto.
  useEffect(() => {
    if (!connection?.expiresAt) return;
    const id = setInterval(() => forzar((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [connection?.expiresAt]);

  // Sólo se marcan como leídos si hay algo pendiente, para no entrar en bucle.
  const hasUnread = useMemo(
    () => chatMessages.some((msg) => msg.receiverId === currentUser?.id && !msg.read),
    [chatMessages, currentUser?.id],
  );

  useEffect(() => {
    if (hasUnread) void markMessagesAsRead(matchId);
  }, [hasUnread, matchId, markMessagesAsRead]);

  const handleSendMessage = useCallback(async () => {
    const messageText = inputMessage.trim();
    if (!messageText || isSending) return;

    setIsSending(true);
    setInputMessage('');

    const success = await sendMessage(matchId, messageText);
    if (success) track('message_sent');
    else setInputMessage(messageText);

    setIsSending(false);
  }, [inputMessage, isSending, matchId, sendMessage]);

  const handleBlock = async () => {
    setShowBlockConfirm(false);
    const blocked = await blockUser(matchId);
    if (blocked) navigate('/matches', { replace: true });
  };

  /**
   * Conserva la conversación más allá del evento.
   *
   * Sin Premium hacen falta las dos personas, y ahí está el problema: si la
   * otra no abre la aplicación hasta el martes, la conversación se ha borrado
   * el domingo. Con Premium basta con guardarla tú, y eso es lo que se ofrece
   * justo aquí, que es donde duele.
   */
  const handleKeep = async () => {
    if (!connection) return;

    setIsKeeping(true);
    try {
      const aSalvo = await premiumNight.keepConnection(connection.connectionId);
      await refreshConnections();
      toast({ title: aSalvo ? t('matches.keepBoth') : t('matches.keepRequested') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setIsKeeping(false);
    }
  };

  if (!match || !connection) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
        <p className="text-party-gray">{t('chat.notFound')}</p>
        <button
          type="button"
          onClick={() => navigate('/matches')}
          className="press rounded-xl bg-party-primary px-5 py-3 font-bold text-ink"
        >
          {t('chat.backToMatches')}
        </button>
      </div>
    );
  }

  const enDirecto = Boolean(activeEvent && connection.eventId === activeEvent.eventId);
  const evento = connection.eventId ? events.find((e) => e.id === connection.eventId) : undefined;
  const quedan = connection.expiresAt ? restante(connection.expiresAt) : null;
  const cierre = connection.expiresAt ? hora(connection.expiresAt) : null;
  const foto = match.photos[0] || match.avatar || FALLBACK_PHOTO;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ------------------------------------------------------- cabecera */}
      <div className="flex items-center gap-3 px-margin pb-3 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground"
        >
          <ArrowLeft size={20} />
        </button>

        <Link to={`/u/${match.id}`} className="press flex min-w-0 flex-1 items-center gap-3">
          <span className="relative shrink-0">
            <img src={foto} alt="" className="h-12 w-12 rounded-full object-cover" />
            {enDirecto && (
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-party-primary ring-2 ring-background" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate font-display text-headline-md font-extrabold">{match.name}</span>
              {enDirecto && (
                <span className="shrink-0 rounded-full bg-party-primary/20 px-2 py-0.5 text-label-pill uppercase text-party-primary">
                  Live
                </span>
              )}
            </span>
            <span className="block truncate text-body-sm text-party-gray">
              {evento
                ? t('chat.atEvent', { name: evento.name })
                : `${t('chat.yearsOld', { age: match.age })}${match.isVerified ? ` · ${t('chat.verified')}` : ''}`}
            </span>
          </span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground"
            aria-label={t('chat.options')}
          >
            <ShieldAlert size={20} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/u/${match.id}`)}>
              <UserRound size={16} className="mr-2" />
              {t('chat.viewProfile')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowReport(true)}>
              <Flag size={16} className="mr-2" />
              {t('chat.report')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowBlockConfirm(true)}
              className="text-destructive focus:text-destructive"
            >
              <Ban size={16} className="mr-2" />
              {t('chat.block')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ------------------------------------------- aviso de caducidad */}
      {connection.expiresAt && (
        <div className="mx-margin space-y-2">
          <div className="flex items-center gap-3 rounded-2xl bg-party-primary px-4 py-3 text-ink">
            <Hourglass size={20} className="shrink-0" />
            <p className="min-w-0 flex-1 text-body-sm font-bold leading-snug">
              {/* Sin Premium se dice la verdad incómoda: no basta contigo. */}
              {connection.keptByMe && !isPremium
                ? t('matches.waitingOther')
                : t('chat.disappears', { time: cierre })}
            </p>
            {quedan && (
              <span className="shrink-0 rounded-lg bg-[#E0BC00] px-2.5 py-1.5 text-center font-display text-sm font-bold leading-tight tabular">
                {quedan}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            {connection.keptByMe && !isPremium && (
              <button
                type="button"
                onClick={() => setShowPremiumDialog(true)}
                className="press flex min-w-0 items-center gap-1.5 text-caption text-party-primary"
              >
                <Crown size={13} className="shrink-0 text-party-accent" />
                <span className="truncate">{t('matches.keepAlonePremium')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleKeep()}
              disabled={isKeeping || connection.keptByMe}
              className="press flex shrink-0 items-center gap-1 rounded-full bg-card px-3 py-1.5 text-caption font-bold text-party-primary disabled:opacity-70"
            >
              {connection.keptByMe ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
              {connection.keptByMe ? t('matches.kept') : t('matches.keep')}
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------- mensajes */}
      <div className="flex-1 space-y-4 overflow-y-auto px-margin py-4">
        {sortedMessages.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <img src={foto} alt="" className="mb-4 h-20 w-20 rounded-full object-cover ring-4 ring-party-primary" />
            <p className="font-display text-headline-md">{t('chat.empty')}</p>
            <p className="mt-1 text-body-sm text-party-gray">{t('chat.emptyBody')}</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <span className="rounded-full bg-card px-4 py-1.5 text-caption uppercase tracking-wider text-party-gray">
                {new Date(sortedMessages[0].createdAt).toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · {hora(sortedMessages[0].createdAt)}
              </span>
            </div>

            {grupos.map((grupo) => {
              const ultimo = grupo.mensajes[grupo.mensajes.length - 1];
              return (
                <div
                  key={grupo.mensajes[0].id}
                  className={cn('flex flex-col gap-1', grupo.propio ? 'items-end' : 'items-start')}
                >
                  {grupo.mensajes.map((msg, i) => {
                    const ultimoDelGrupo = i === grupo.mensajes.length - 1;
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'max-w-[80%] px-4 py-3 text-body-md',
                          grupo.propio
                            ? 'rounded-3xl bg-party-primary text-ink'
                            : 'rounded-3xl bg-surface-container text-white',
                          ultimoDelGrupo && (grupo.propio ? 'rounded-br-md' : 'rounded-bl-md'),
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    );
                  })}
                  <span className="flex items-center gap-1 px-2 text-[11px] text-party-gray">
                    {hora(ultimo.createdAt)}
                    {grupo.propio &&
                      (ultimo.read ? (
                        <CheckCheck size={14} className="text-party-primary" aria-label={t('chat.read')} />
                      ) : (
                        <Check size={14} aria-label={t('chat.sent')} />
                      ))}
                  </span>
                </div>
              );
            })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ------------------------------------------------------- entrada */}
      <form
        className="flex items-center gap-3 bg-surface-low px-margin py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSendMessage();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          {t('chat.placeholder')}
        </label>
        <input
          id="chat-input"
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={connection.expiresAt ? t('chat.placeholderEphemeral') : t('chat.placeholder')}
          maxLength={1000}
          autoComplete="off"
          className="h-14 min-w-0 flex-1 rounded-full bg-surface-high px-5 text-body-md text-foreground outline-none placeholder:text-party-gray focus:ring-[1.5px] focus:ring-party-primary"
        />
        <button
          type="submit"
          disabled={!inputMessage.trim() || isSending}
          className="press flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-party-primary text-ink disabled:opacity-40"
          aria-label={t('chat.send')}
        >
          <SendHorizontal size={22} />
        </button>
      </form>

      <ReportUserDialog
        isOpen={showReport}
        onClose={() => setShowReport(false)}
        userId={matchId}
        userName={match.name}
      />

      <AlertDialog open={showBlockConfirm} onOpenChange={setShowBlockConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.blockTitle', { name: match.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('chat.blockBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleBlock()}>{t('chat.block')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatWindow;
