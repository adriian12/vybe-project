import React from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, MessageCircle, Sparkles, Timer, UserRound, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { User } from '@/types/user';
import { useInterestLabel } from './interest-picker';
import { formatDistance } from '@/services/geo';

interface MatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchedUser: User | null;
  currentUserPhoto?: string;
  onSendMessage?: () => void;
  onViewProfile?: () => void;
  /** Evento en el que ha ocurrido. */
  eventName?: string;
  /** Hora de cierre del evento, cuando caduca el chat. */
  endsAt?: string;
  /** Intereses propios, para enseñar los que compartís. */
  myInterests?: string[];
}

const FALLBACK_PHOTO = '/placeholder.svg';

/**
 * «¡Nuevo Vybe!», según «Match en Directo» de Stitch: las dos fotos inclinadas
 * con el rayo en medio, dónde ha pasado, qué tenéis en común y el chat, que
 * caduca con la fiesta.
 */
const MatchDialog: React.FC<MatchDialogProps> = ({
  isOpen,
  onClose,
  matchedUser,
  currentUserPhoto,
  onSendMessage,
  onViewProfile,
  eventName,
  endsAt,
  myInterests = [],
}) => {
  const { t } = useTranslation();
  const interestLabel = useInterestLabel();
  if (!matchedUser) return null;

  const comunes = (matchedUser.interests ?? []).filter((slug) => myInterests.includes(slug));
  const restante = endsAt ? new Date(endsAt).getTime() - Date.now() : 0;
  const horas = Math.floor(restante / 3_600_000);
  const minutos = Math.floor((restante % 3_600_000) / 60_000);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-0 bg-surface p-5 sm:max-w-md">
        <DialogTitle className="sr-only">{t('match.newConnection')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('match.connectedWith', { name: matchedUser.name })}
        </DialogDescription>

        {eventName && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface-high px-3 py-1.5 text-label-pill uppercase tracking-wider">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t('matchDialog.onTheFloor', { name: eventName })}
            </span>
          </div>
        )}

        <div className="text-center">
          <h2 className="flex items-center justify-center gap-1 font-display text-headline-xl uppercase text-[#FFEFBC]">
            <Zap size={22} className="fill-party-primary text-party-primary" />
            {t('matchDialog.title')}
            <Zap size={22} className="fill-party-primary text-party-primary" />
          </h2>
          <p className="mx-auto mt-1 max-w-xs text-body-md text-[#D0C6AB]">
            {eventName
              ? t('matchDialog.bodyAt', { name: matchedUser.name, event: eventName })
              : t('match.connectedWith', { name: matchedUser.name })}
          </p>
        </div>

        {/* Las dos fotos, inclinadas hacia fuera, con el rayo encima. */}
        <div className="relative mx-auto flex h-48 w-72 items-center justify-center">
          <div className="absolute left-3 h-40 w-32 -rotate-6 overflow-hidden rounded-xl bg-surface-high shadow-2xl">
            <img src={currentUserPhoto || FALLBACK_PHOTO} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E0E11]/90 via-transparent to-transparent" />
            <span className="absolute bottom-2 left-2 text-caption text-[#D0C6AB]">{t('matchDialog.you')}</span>
          </div>
          <div className="absolute right-3 h-40 w-32 rotate-6 overflow-hidden rounded-xl bg-surface-high shadow-2xl">
            <img
              src={matchedUser.photos[0] || matchedUser.avatar || FALLBACK_PHOTO}
              alt={matchedUser.name}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0E0E11]/90 via-transparent to-transparent" />
            <span className="absolute bottom-2 left-2 right-2 flex items-center gap-1">
              <span className="truncate font-display text-title-card text-white">
                {matchedUser.name}, {matchedUser.age}
              </span>
              {matchedUser.isVerified && <BadgeCheck size={14} className="shrink-0 text-party-primary" />}
            </span>
          </div>
          <div className="absolute z-10 -translate-y-1 flex flex-col items-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-party-primary text-ink shadow-[0_0_24px_rgba(248,208,0,0.6)]">
              <Zap size={30} className="fill-ink" />
            </span>
            {comunes.length > 0 && (
              <span className="mt-2 whitespace-nowrap rounded-full bg-[#0E0E11] px-2.5 py-0.5 text-label-pill uppercase text-party-primary shadow-md">
                {t('matchDialog.inCommon', { count: comunes.length })}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-xl bg-[#0E0E11] p-4">
          {matchedUser.distance !== undefined && (
            <div className="flex items-center gap-3 rounded-lg bg-surface-container px-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-party-primary/20 text-party-primary">
                <Sparkles size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-caption uppercase tracking-wider text-[#D0C6AB]">
                    {t('matchDialog.nearby')}
                  </span>
                  <span className="text-label-pill text-emerald-400">{t('matchDialog.live')}</span>
                </div>
                <p className="truncate text-body-sm font-semibold">
                  {t('swiping.distanceFromYou', { distance: formatDistance(matchedUser.distance) })}
                </p>
              </div>
            </div>
          )}

          {comunes.length > 0 && (
            <div>
              <p className="text-caption uppercase tracking-wider text-[#D0C6AB]">{t('matchDialog.sameRhythm')}</p>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {comunes.slice(0, 5).map((slug) => (
                  <span key={slug} className="rounded-full bg-surface-high px-2.5 py-1 text-caption">
                    {interestLabel(slug)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-[#D0C6AB]">
            <span className="flex items-center gap-1.5 text-[11px]">
              <Timer size={13} className="text-party-primary" />
              {t('matchDialog.chatExpires')}
            </span>
            {restante > 0 && (
              <span className="shrink-0 text-label-pill uppercase text-party-primary tabular">
                {t('matchDialog.left', { time: `${horas}h ${String(minutos).padStart(2, '0')}m` })}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onSendMessage}
            disabled={!onSendMessage}
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card uppercase tracking-wide text-ink shadow-[0_4px_20px_rgba(248,208,0,0.35)]"
          >
            <MessageCircle size={18} />
            {t('matchDialog.sendMessage')}
          </button>

          <div className="flex items-center justify-between pt-1">
            {onViewProfile ? (
              <button
                type="button"
                onClick={onViewProfile}
                className="press flex items-center gap-1 text-caption text-[#D0C6AB] hover:text-white"
              >
                <UserRound size={14} />
                {t('matchDialog.viewProfile', { name: matchedUser.name })}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onClose}
              className="press text-caption font-bold text-party-primary"
            >
              {t('match.keepDiscovering')} →
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MatchDialog;
