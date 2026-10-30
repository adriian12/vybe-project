import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Link2, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

/** El mismo límite que el resto de imágenes de la aplicación. */
const MAX_POSTER_BYTES = 10 * 1024 * 1024;

/**
 * El cartel de una fiesta: se sube desde el ordenador o el móvil, o se pega el
 * enlace de una imagen que ya está en internet (la web del local, Instagram…).
 *
 * No sube nada: el formulario recibe el fichero y lo sube al guardar, para no
 * dejar ficheros sueltos si al final no se crea la fiesta.
 */
const PosterPicker = ({
  preview,
  onFile,
  onUrl,
  onClear,
}: {
  /** El cartel que se ve: el guardado, el enlace pegado o el fichero elegido. */
  preview: string | null;
  onFile: (file: File, previewUrl: string) => void;
  onUrl: (url: string) => void;
  onClear: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [enlace, setEnlace] = useState('');
  // Un id propio en cada formulario: el del negocio y el de administración
  // pueden estar dos veces en la página (panel y hoja del móvil) y, con el
  // mismo id, el botón abría el selector del otro y la imagen no se veía.
  const id = `cartel-${useId().replace(/:/g, '')}`;

  const usarEnlace = () => {
    const url = enlace.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      toast({ title: t('venue.events.posterUrlInvalid'), variant: 'destructive' });
      return;
    }
    onUrl(url);
    setEnlace('');
  };

  return (
    <div className="space-y-2">
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > MAX_POSTER_BYTES) {
            toast({ title: t('auth.errors.fileTooBig'), variant: 'destructive' });
            return;
          }
          onFile(file, URL.createObjectURL(file));
        }}
      />

      {preview ? (
        <div className="relative overflow-hidden rounded-xl">
          <img src={preview} alt="" className="aspect-[16/10] w-full object-cover" />
          <button
            type="button"
            onClick={onClear}
            aria-label={t('common.delete')}
            className="press absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/80 text-white"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink/20 bg-[#F5F5F7] px-4 py-5 text-center">
          <ImagePlus size={24} />
          <p className="text-body-sm">{t('venue.events.posterDrop')}</p>
          {/* El disparador es un `label`: dentro de un formulario un botón lo
              enviaría. Tiene forma de botón de verdad a propósito. */}
          <label
            htmlFor={id}
            className="press inline-flex h-9 cursor-pointer items-center rounded-xl bg-ink px-4 text-sm font-bold text-white"
          >
            {t('venue.events.selectFile')}
          </label>
          <p className="text-caption text-ink/60">{t('venue.events.posterHelp')}</p>
        </div>
      )}

      {/* O el enlace de una imagen que ya está publicada. */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            value={enlace}
            onChange={(e) => setEnlace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                usarEnlace();
              }
            }}
            placeholder={t('venue.events.posterUrlPlaceholder')}
            aria-label={t('venue.events.posterUrlPlaceholder')}
            className="h-10 w-full rounded-xl border border-black/10 bg-[#F5F5F7] pl-9 pr-3 text-body-sm text-ink placeholder:text-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
        </div>
        <button
          type="button"
          onClick={usarEnlace}
          disabled={!enlace.trim()}
          className="press h-10 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-40"
        >
          {t('venue.events.posterUrlUse')}
        </button>
      </div>
    </div>
  );
};

export default PosterPicker;
