import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, FileText, Trash2, Upload } from 'lucide-react';
import { PartyButton } from '@/components/ui-custom/party-button';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';

const MAX_DOCUMENTOS = 6;
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Documentación del local, después del alta.
 *
 * Sólo se podía subir en el formulario de registro. Si administración pedía
 * otro papel, o si una subida fallaba, el local no tenía dónde ponerlo y se
 * quedaba sin aprobar sin poder hacer nada al respecto.
 *
 * El bucket es privado: lo que se guarda en `venues.documents` son rutas, y
 * para verlas hay que firmarlas en el momento.
 */
const VenueDocuments = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentVenue } = useAppContext();

  const [documentos, setDocumentos] = useState<string[]>(currentVenue?.documents ?? []);
  const [subiendo, setSubiendo] = useState(false);

  const abrir = useCallback(
    async (ruta: string) => {
      const url = await api.signedDocumentUrl(ruta);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else toast({ title: t('common.error'), variant: 'destructive' });
    },
    [toast, t],
  );

  const guardar = useCallback(
    async (rutas: string[]) => {
      if (!currentVenue) return;

      const { error } = await supabase
        .from('venues')
        .update({ documents: rutas })
        .eq('id', currentVenue.id);

      if (error) throw error;
      setDocumentos(rutas);
    },
    [currentVenue],
  );

  const subir = useCallback(
    async (ficheros: File[]) => {
      if (!currentVenue) return;

      const sitio = MAX_DOCUMENTOS - documentos.length;
      if (sitio <= 0) {
        toast({ title: t('venue.documents.tooMany'), variant: 'destructive' });
        return;
      }

      const grandes = ficheros.filter((f) => f.size > MAX_BYTES);
      if (grandes.length > 0) {
        toast({
          title: t('auth.errors.fileTooBig'),
          description: grandes.map((f) => f.name).join(', '),
          variant: 'destructive',
        });
      }

      const validos = ficheros.filter((f) => f.size <= MAX_BYTES).slice(0, sitio);
      if (validos.length === 0) return;

      setSubiendo(true);
      try {
        const subidos = await Promise.all(
          validos.map((file) =>
            api.uploadFile('documents', file, file.name).then((r) => r.path),
          ),
        );

        await guardar([...documentos, ...subidos]);
        toast({ title: t('venue.documents.uploaded', { count: subidos.length }) });
      } catch (error) {
        console.error('Error uploading venue documents:', error);
        toast({ title: t('common.error'), variant: 'destructive' });
      } finally {
        setSubiendo(false);
      }
    },
    [currentVenue, documentos, guardar, toast, t],
  );

  const quitar = useCallback(
    async (ruta: string) => {
      try {
        await guardar(documentos.filter((d) => d !== ruta));
        await api.deleteFile('documents', ruta);
      } catch {
        toast({ title: t('common.error'), variant: 'destructive' });
      }
    },
    [documentos, guardar, toast, t],
  );

  if (!currentVenue) return null;

  const verificado = currentVenue.isVerified;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t('auth.documents')}</h3>
          <p className="text-xs text-party-gray">{t('venue.documents.help')}</p>
        </div>

        <span
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] ${
            verificado
              ? 'bg-party-primary/15 text-party-primary'
              : 'bg-party-accent/15 text-party-accent'
          }`}
        >
          {verificado ? <CheckCircle2 size={12} /> : <Clock size={12} />}
          {verificado ? t('venue.config.verified') : t('venue.config.pending')}
        </span>
      </div>

      {documentos.length > 0 ? (
        <ul className="space-y-1.5">
          {documentos.map((ruta, indice) => (
            <li
              key={ruta}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
            >
              <FileText size={14} className="shrink-0 text-party-gray" />
              <button
                type="button"
                onClick={() => void abrir(ruta)}
                className="press min-w-0 flex-1 truncate text-left underline underline-offset-2"
              >
                {/* La ruta lleva delante el id y una marca de tiempo: se enseña
                    sólo el nombre del fichero, que es lo que reconoce el local. */}
                {ruta.split('/').pop()?.replace(/^\d+-\d+-/, '') ?? `#${indice + 1}`}
              </button>

              {!verificado && (
                <button
                  type="button"
                  onClick={() => void quitar(ruta)}
                  className="press shrink-0 text-destructive"
                  aria-label={t('common.delete')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {t('auth.documentsRequired')}
        </p>
      )}

      {documentos.length < MAX_DOCUMENTOS && (
        <>
          <input
            id="venue-more-documents"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            disabled={subiendo}
            onChange={(event) => {
              const ficheros = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (ficheros.length > 0) void subir(ficheros);
            }}
          />
          <PartyButton asChild variant="outline" size="sm" className="w-full cursor-pointer">
            <label htmlFor="venue-more-documents">
              <Upload size={14} className="mr-2" />
              {subiendo ? t('venue.documents.uploading') : t('venue.documents.add')}
            </label>
          </PartyButton>
        </>
      )}
    </div>
  );
};

export default VenueDocuments;
