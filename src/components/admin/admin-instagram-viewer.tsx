import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Hand } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { openExternal } from '@/services/native';
import { cn } from '@/lib/utils';

export type Pieza = { tipo: 'video' | 'imagen'; url: string };

export type PostEnGrande = {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  manual: boolean;
  permalink: string | null;
  preview_url: string | null;
  media: Pieza[];
  caption: string | null;
};

interface Props {
  post: PostEnGrande | null;
  onClose: () => void;
}

/**
 * La pieza en grande, para revisarla antes de que salga: el vídeo del reel con
 * su portada, cada foto del carrusel con flechas, la historia a tamaño de
 * pantalla, el texto que se publica y, si va a mano, qué sticker poner.
 */
const AdminInstagramViewer = ({ post, onClose }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [i, setI] = useState(0);

  useEffect(() => setI(0), [post?.id]);

  const piezas: Pieza[] = post
    ? post.media.length
      ? post.media
      : post.preview_url ? [{ tipo: 'imagen', url: post.preview_url }] : []
    : [];
  const actual = piezas[Math.min(i, Math.max(piezas.length - 1, 0))];
  const vertical = post?.tipo !== 'carrusel';

  useEffect(() => {
    if (!post || piezas.length < 2) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, piezas.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [post, piezas.length]);

  const copiar = async () => {
    if (!post?.caption) return;
    try {
      await navigator.clipboard.writeText(post.caption);
      toast({ title: t('admin.instagram.viewer.copied') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={Boolean(post)} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        {post && (
          <div className="grid gap-5 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
            <div className="flex flex-col items-center gap-3">
              <div
                className={cn(
                  'relative overflow-hidden rounded-xl bg-black',
                  vertical ? 'aspect-[9/16] h-[min(70dvh,640px)]' : 'aspect-[4/5] h-[min(62dvh,560px)]',
                )}
              >
                {!actual && (
                  <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-body-sm text-party-gray">
                    {t('admin.instagram.viewer.noMedia')}
                  </p>
                )}
                {actual?.tipo === 'video' && (
                  <video
                    key={actual.url}
                    src={actual.url}
                    poster={post.preview_url ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                )}
                {actual?.tipo === 'imagen' && <img src={actual.url} alt="" className="h-full w-full object-contain" />}

                {piezas.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label={t('admin.instagram.viewer.previous')}
                      disabled={i === 0}
                      onClick={() => setI((n) => Math.max(n - 1, 0))}
                      className="press absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      type="button"
                      aria-label={t('admin.instagram.viewer.next')}
                      disabled={i >= piezas.length - 1}
                      onClick={() => setI((n) => Math.min(n + 1, piezas.length - 1))}
                      className="press absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30"
                    >
                      <ChevronRight size={20} />
                    </button>
                  </>
                )}
              </div>

              {piezas.length > 1 && (
                <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
                  {piezas.map((p, n) => (
                    <button
                      key={p.url}
                      type="button"
                      aria-label={t('admin.instagram.viewer.slide', { n: n + 1 })}
                      onClick={() => setI(n)}
                      className={cn('h-14 w-11 shrink-0 overflow-hidden rounded-md bg-black ring-2', n === i ? 'ring-party-primary' : 'ring-transparent')}
                    >
                      {p.tipo === 'imagen' ? <img src={p.url} alt="" className="h-full w-full object-cover" /> : <span className="text-caption text-white">▶</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              <div>
                <DialogTitle className="font-display text-headline-md">{post.titulo}</DialogTitle>
                <DialogDescription className="mt-1 text-caption text-party-gray">
                  {piezas.length > 1 ? t('admin.instagram.viewer.count', { n: i + 1, total: piezas.length }) : post.id}
                </DialogDescription>
              </div>

              {post.manual && post.detalle && (
                <div className="flex gap-2 rounded-xl bg-[#FF6B00]/15 p-3 text-body-sm">
                  <Hand size={16} className="mt-0.5 shrink-0 text-[#FF6B00]" />
                  <p>{post.detalle}</p>
                </div>
              )}

              {post.caption ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-caption font-extrabold uppercase text-party-gray">{t('admin.instagram.viewer.caption')}</p>
                    <button type="button" onClick={() => void copiar()} className="press inline-flex items-center gap-1 text-caption font-bold">
                      <Copy size={13} />
                      {t('admin.instagram.viewer.copy')}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap rounded-xl bg-white/[0.04] p-3 text-body-sm leading-relaxed">{post.caption}</p>
                </div>
              ) : (
                <p className="text-body-sm text-party-gray">{t('admin.instagram.viewer.noCaption')}</p>
              )}

              {post.permalink && (
                <button
                  type="button"
                  onClick={() => void openExternal(post.permalink as string)}
                  className="press inline-flex h-10 items-center gap-2 rounded-lg bg-party-primary px-4 text-body-sm font-bold text-ink"
                >
                  <ExternalLink size={15} />
                  {t('admin.instagram.open')}
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdminInstagramViewer;
