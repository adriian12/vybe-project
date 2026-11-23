import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, Check, CircleDashed, Clapperboard, Clock, ExternalLink, Hand, Images, Loader2, Pin, Send, Smartphone,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { openExternal } from '@/services/native';
import { cn } from '@/lib/utils';
import AdminInstagramViewer, { Pieza } from '@/components/admin/admin-instagram-viewer';

type Post = {
  id: string;
  dia: number;
  scheduled_at: string;
  tipo: string;
  lado: string | null;
  titulo: string;
  detalle: string | null;
  manual: boolean;
  estado: string;
  permalink: string | null;
  preview_url: string | null;
  done_at: string | null;
  synced_at: string;
  media: Pieza[];
  caption: string | null;
};

type Filtro = 'upcoming' | 'manual' | 'all';

const ICONO = { reel: Clapperboard, carrusel: Images, historia: Smartphone, fijar: Pin } as const;

/** Lo que el notificador ya ha publicado o lo que la persona ha marcado como subido. */
const hecho = (p: Post) => p.estado === 'publicado' || Boolean(p.done_at);
/** Lo que le toca subir a mano y todavía no ha marcado. */
const porSubir = (p: Post) => (p.manual || p.estado === 'fallo') && !hecho(p);

/**
 * Campaña de Instagram (migración 144): la agenda de la NAS con su estado.
 * El notificador publica lo automático y manda por Telegram lo que lleva
 * sticker; aquí se ve todo y se marca lo que se ha subido a mano.
 */
const AdminInstagram = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('upcoming');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Post | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_instagram_posts');
    if (error) {
      toast({ title: t('common.error'), variant: 'destructive' });
      setPosts([]);
      return;
    }
    setPosts(data as unknown as Post[]);
  }, [t, toast]);

  useEffect(() => {
    void cargar();
    // La NAS manda el estado cada minuto si cambia algo.
    const id = window.setInterval(() => void cargar(), 60_000);
    return () => window.clearInterval(id);
  }, [cargar]);

  const marcar = async (post: Post, hechoAhora: boolean) => {
    setOcupado(post.id);
    try {
      const { data, error } = await supabase.rpc('admin_mark_instagram_done', { p_id: post.id, p_done: hechoAhora });
      if (error) throw error;
      setPosts((prev) => prev?.map((p) => (p.id === post.id ? { ...p, done_at: (data as string | null) ?? null } : p)) ?? prev);
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const resumen = useMemo(() => {
    const lista = posts ?? [];
    return {
      total: lista.length,
      publicados: lista.filter(hecho).length,
      aMano: lista.filter((p) => porSubir(p) && new Date(p.scheduled_at).getTime() <= Date.now() + 864e5).length,
    };
  }, [posts]);

  const dias = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const visibles = (posts ?? []).filter((p) => {
      if (filtro === 'manual') return porSubir(p);
      if (filtro === 'upcoming') return new Date(p.scheduled_at) >= hoy;
      return true;
    });
    const grupos = new Map<string, Post[]>();
    for (const p of visibles) {
      const clave = new Date(p.scheduled_at).toLocaleDateString('en-CA');
      grupos.set(clave, [...(grupos.get(clave) ?? []), p]);
    }
    return [...grupos.entries()];
  }, [posts, filtro]);

  const hora = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const fecha = (clave: string) =>
    new Date(`${clave}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });

  if (!posts) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
      </div>
    );
  }

  const ultimo = posts.reduce<string | null>((a, p) => (!a || p.synced_at > a ? p.synced_at : a), null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t('admin.instagram.published'), value: `${resumen.publicados}/${resumen.total}` },
          { label: t('admin.instagram.manualDue'), value: resumen.aMano, alerta: resumen.aMano > 0 },
          { label: t('admin.instagram.synced'), value: ultimo ? hora(ultimo) : '—' },
        ].map((c) => (
          <div key={c.label} className={cn('surface-light rounded-2xl p-4', c.alerta && 'ring-2 ring-party-primary')}>
            <p className="text-caption font-bold uppercase text-party-gray">{c.label}</p>
            <p className="font-display text-headline-lg">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {(['upcoming', 'manual', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filtro === f}
            onClick={() => setFiltro(f)}
            className={cn(
              'press h-9 rounded-full px-4 text-caption font-bold',
              filtro === f ? 'bg-party-primary text-ink' : 'bg-white/[0.06] text-[#C8C6C5]',
            )}
          >
            {t(`admin.instagram.filters.${f}`)}
          </button>
        ))}
      </div>

      {dias.length === 0 && (
        <div className="surface-light flex flex-col items-center gap-2 rounded-2xl p-8 text-center text-party-gray">
          <Check size={22} />
          <p className="text-body-sm">{posts.length ? t('admin.instagram.emptyFilter') : t('admin.instagram.empty')}</p>
        </div>
      )}

      {dias.map(([clave, lista]) => (
        <section key={clave} className="space-y-2">
          <h3 className="text-caption font-extrabold uppercase tracking-wide text-[#C8C6C5]">
            {fecha(clave)} · {t('admin.instagram.day', { n: lista[0].dia })}
          </h3>
          <ul className="grid gap-2 lg:grid-cols-2">
            {lista.map((p) => {
              const Icono = ICONO[p.tipo as keyof typeof ICONO] ?? Smartphone;
              const listo = hecho(p);
              const toca = porSubir(p);
              return (
                <li key={p.id} className={cn('surface-light flex gap-3 rounded-2xl p-3', listo && 'opacity-70')}>
                  <button
                    type="button"
                    onClick={() => setAbierto(p)}
                    aria-label={t('admin.instagram.viewer.open')}
                    className="press relative h-24 w-[3.4rem] shrink-0 overflow-hidden rounded-lg bg-black/[0.06] ring-party-primary hover:ring-2"
                  >
                    {p.preview_url ? (
                      <img src={p.preview_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <Icono size={20} className="absolute inset-0 m-auto text-party-gray" />
                    )}
                    {listo && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1DB954] text-white">
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-extrabold uppercase">
                        <Icono size={11} />
                        {t(`admin.instagram.types.${p.tipo}`, { defaultValue: p.tipo })}
                      </span>
                      {p.lado && (
                        <span className={cn(
                          'rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase',
                          p.lado === 'negocios' ? 'bg-ink text-party-primary' : 'bg-party-primary/30 text-ink',
                        )}
                        >
                          {t(`admin.instagram.sides.${p.lado}`)}
                        </span>
                      )}
                      {p.manual && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#FF6B00] px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-white">
                          <Hand size={11} />
                          {t('admin.instagram.manual')}
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1 text-caption font-bold text-party-gray">
                        <Clock size={12} />
                        {hora(p.scheduled_at)}
                      </span>
                    </div>

                    <button type="button" onClick={() => setAbierto(p)} className="mt-1 line-clamp-2 text-left text-body-sm font-semibold hover:underline">
                      {p.titulo}
                    </button>
                    {toca && p.detalle && <p className="mt-1 text-caption text-ink/70">{p.detalle}</p>}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-caption font-bold">
                      <Estado post={p} />
                      {p.permalink && (
                        <button
                          type="button"
                          onClick={() => void openExternal(p.permalink as string)}
                          className="press inline-flex items-center gap-1 text-[#7a6200] underline underline-offset-2"
                        >
                          <ExternalLink size={12} />
                          {t('admin.instagram.open')}
                        </button>
                      )}
                      {p.manual && (
                        <button
                          type="button"
                          disabled={ocupado === p.id}
                          onClick={() => void marcar(p, !p.done_at)}
                          className={cn(
                            'press ml-auto inline-flex h-8 items-center gap-1 rounded-lg border px-3 disabled:opacity-50',
                            p.done_at ? 'border-black/10 text-party-gray' : 'border-ink',
                          )}
                        >
                          <Check size={13} />
                          {p.done_at ? t('admin.instagram.undo') : t('admin.instagram.markDone')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <AdminInstagramViewer post={abierto} onClose={() => setAbierto(null)} />
    </div>
  );
};

const Estado = ({ post }: { post: Post }) => {
  const { t } = useTranslation();
  if (post.done_at) return <span className="inline-flex items-center gap-1 text-[#1DB954]"><Check size={13} />{t('admin.instagram.status.done')}</span>;
  switch (post.estado) {
    case 'publicado':
      return <span className="inline-flex items-center gap-1 text-[#1DB954]"><Check size={13} />{t('admin.instagram.status.published')}</span>;
    case 'enviado':
      return <span className="inline-flex items-center gap-1 text-[#FF6B00]"><Send size={13} />{t('admin.instagram.status.sent')}</span>;
    case 'fallo':
      return <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle size={13} />{t('admin.instagram.status.failed')}</span>;
    case 'caducado':
      return <span className="inline-flex items-center gap-1 text-party-gray"><CircleDashed size={13} />{t('admin.instagram.status.expired')}</span>;
    default:
      return (
        <span className="inline-flex items-center gap-1 text-party-gray">
          <Clock size={13} />
          {post.manual ? t('admin.instagram.status.manualScheduled') : t('admin.instagram.status.scheduled')}
        </span>
      );
  }
};

export default AdminInstagram;
