import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { PromoterTeam, promotersService, TEAM_CHIP, TEAM_COLORS, TEAM_DOT, TeamColor } from '@/services/promoters';
import type { TeamLink } from '@/services/team';
import { cn } from '@/lib/utils';

/** Etiqueta de un equipo: «#EquipoRosa» con su color. */
export const TeamTag = ({ team }: { team: PromoterTeam }) => (
  <span className={cn('inline-block max-w-full truncate rounded-md px-1.5 py-0.5 text-[11px] font-bold', TEAM_CHIP[team.color])}>
    #{team.name}
  </span>
);

interface PromoterTeamsProps {
  teams: PromoterTeam[];
  /** Los enlaces fijos de RRPP del negocio. */
  promoters: TeamLink[];
  onChanged: () => Promise<void> | void;
}

/**
 * Equipos de RRPP (migración 106): el propietario los crea, les da un color y
 * mete en ellos a sus RRPP. Un RRPP puede estar en varios.
 */
const PromoterTeams = ({ teams, promoters, onChanged }: PromoterTeamsProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editando, setEditando] = useState<{ id: string | null; name: string; color: TeamColor } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [asignando, setAsignando] = useState<string | null>(null);

  const fallo = (error: unknown) =>
    toast({
      title: t('common.error'),
      description: t(error instanceof ApiError ? error.message : 'errors.generic'),
      variant: 'destructive',
    });

  const guardar = async () => {
    if (!editando?.name.trim()) return;
    setOcupado(true);
    try {
      await promotersService.saveTeam(editando);
      setEditando(null);
      await onChanged();
    } catch (error) {
      fallo(error);
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (team: PromoterTeam) => {
    if (!window.confirm(t('venue.promoters.deleteConfirm', { name: team.name }))) return;
    try {
      await promotersService.deleteTeam(team.id);
      setEditando(null);
      await onChanged();
    } catch (error) {
      fallo(error);
    }
  };

  const alternar = async (link: TeamLink, team: PromoterTeam) => {
    const actuales = teams.filter((x) => x.linkIds.includes(link.id)).map((x) => x.id);
    const nuevos = actuales.includes(team.id) ? actuales.filter((id) => id !== team.id) : [...actuales, team.id];
    try {
      await promotersService.setLinkTeams(link.id, nuevos);
      await onChanged();
    } catch (error) {
      fallo(error);
    }
  };

  return (
    <section className="surface-light space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-display text-title-card uppercase tracking-wide">
          <Tags size={17} className="text-party-primary" />
          {t('venue.promoters.teamsTitle')}
        </h3>
        {!editando && (
          <button
            type="button"
            onClick={() => setEditando({ id: null, name: '', color: TEAM_COLORS[teams.length % TEAM_COLORS.length] })}
            className="press flex h-9 items-center gap-1 rounded-lg bg-party-primary px-3 text-caption font-bold text-ink"
          >
            <Plus size={14} />
            {t('venue.promoters.newTeam')}
          </button>
        )}
      </div>
      <p className="text-caption text-party-gray">{t('venue.promoters.teamsBody')}</p>

      {editando && (
        <div className="space-y-3 rounded-xl bg-black/[0.03] p-3">
          <Input
            value={editando.name}
            maxLength={40}
            autoFocus
            onChange={(e) => setEditando({ ...editando, name: e.target.value.replace(/^#/, '') })}
            placeholder={t('venue.promoters.teamName')}
          />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('venue.promoters.color')}>
            {TEAM_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={editando.color === c}
                aria-label={c}
                onClick={() => setEditando({ ...editando, color: c })}
                className={cn(
                  'press flex h-8 w-8 items-center justify-center rounded-full',
                  TEAM_DOT[c],
                  editando.color === c && 'ring-2 ring-ink ring-offset-2',
                )}
              >
                {editando.color === c && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {editando.id && (
              <button
                type="button"
                onClick={() => void borrar(teams.find((x) => x.id === editando.id) as PromoterTeam)}
                className="press flex h-10 items-center gap-1 rounded-lg px-2 text-caption font-bold text-destructive"
              >
                <Trash2 size={14} />
                {t('venue.promoters.delete')}
              </button>
            )}
            <PartyButton variant="outline" className="flex-1" onClick={() => setEditando(null)}>
              {t('common.cancel')}
            </PartyButton>
            <PartyButton className="flex-1" disabled={ocupado || !editando.name.trim()} onClick={() => void guardar()}>
              {ocupado && <Loader2 size={15} className="animate-spin" />}
              {t('venue.promoters.save')}
            </PartyButton>
          </div>
        </div>
      )}

      {teams.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {teams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => setEditando({ id: team.id, name: team.name, color: team.color })}
              className={cn('press flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-caption font-bold', TEAM_CHIP[team.color])}
            >
              #{team.name}
              <span className="opacity-60">· {team.linkIds.length}</span>
              <Pencil size={11} className="opacity-60" />
            </button>
          ))}
        </div>
      )}

      {/* Cada RRPP con sus equipos; se cambian tocando «Equipos». */}
      {promoters.length > 0 && (
        <ul className="divide-y divide-black/[0.06]">
          {promoters.map((link) => {
            const suyos = teams.filter((x) => x.linkIds.includes(link.id));
            const abierto = asignando === link.id;
            return (
              <li key={link.id} className="py-2.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-md font-bold">{link.label}</p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {suyos.length === 0 ? (
                        <span className="text-caption text-party-gray">{t('venue.promoters.noTeam')}</span>
                      ) : (
                        suyos.map((x) => <TeamTag key={x.id} team={x} />)
                      )}
                    </div>
                  </div>
                  {teams.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={abierto}
                      onClick={() => setAsignando(abierto ? null : link.id)}
                      className="press flex h-8 shrink-0 items-center rounded-lg border border-black/15 px-2 text-caption font-bold"
                    >
                      {t('venue.promoters.assign')}
                    </button>
                  )}
                </div>
                {abierto && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {teams.map((team) => {
                      const dentro = team.linkIds.includes(link.id);
                      return (
                        <button
                          key={team.id}
                          type="button"
                          aria-pressed={dentro}
                          onClick={() => void alternar(link, team)}
                          className={cn(
                            'press flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-caption font-bold',
                            dentro ? TEAM_CHIP[team.color] : 'bg-black/[0.05] text-ink/50',
                          )}
                        >
                          {dentro && <Check size={12} />}#{team.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {teams.length === 0 && promoters.length > 0 && !editando && (
        <p className="text-caption text-party-gray">{t('venue.promoters.noTeams')}</p>
      )}
    </section>
  );
};

export default PromoterTeams;
