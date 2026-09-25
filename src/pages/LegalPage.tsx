import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { APP_URL, LANDING_URL } from '@/lib/hosts';
import { LEGAL_UPDATED, legalDocs, resolveLegalDoc } from '@/lib/legal-docs';

/**
 * Textos legales: `/legal` (índice) y `/legal/<documento>`.
 *
 * Los textos están en `src/lib/legal-docs.ts`. Las URL que se dan a las
 * tiendas y a la gente son las de la web pública (`fiestea.es/legal/…`); en la
 * app y en el panel se abren con enlaces relativos.
 */
const LegalPage = () => {
  const { document: slug } = useParams<{ document?: string }>();
  const { t } = useTranslation();

  const docs = useMemo(
    () => legalDocs(t('common.appName'), LANDING_URL, APP_URL, t('accountKind.compare.vyber').toLowerCase()),
    [t],
  );
  const id = resolveLegalDoc(slug);
  const doc = id ? docs.find((d) => d.id === id) : null;

  return (
    <div className="min-h-screen px-6 pt-[calc(1.5rem+var(--safe-top))] pb-[calc(1.5rem+var(--safe-bottom))]">
      <div className="mx-auto max-w-2xl">
        <Link to={doc ? '/legal' : '/'} className="mb-6 inline-flex items-center gap-2 text-sm text-party-primary">
          <ArrowLeft size={16} />
          {doc ? 'Textos legales' : t('common.goHome')}
        </Link>

        {doc ? (
          <>
            <h1 className="mb-1 text-2xl font-bold">{doc.title}</h1>
            <p className="mb-8 text-sm text-party-gray">Última actualización: {LEGAL_UPDATED}</p>

            <div className="space-y-6">
              {doc.sections.map((section) => (
                <section key={section.title}>
                  <h2 className="mb-2 font-semibold">{section.title}</h2>
                  <p className="text-sm leading-relaxed text-party-gray">{section.body}</p>
                </section>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold">Textos legales</h1>
            <p className="mb-6 text-sm text-party-gray">
              {slug ? 'Ese documento no existe. Estos son los que hay:' : `Todo lo que regula el uso de ${t('common.appName')}.`}
            </p>
            <ul className="divide-y divide-border rounded-2xl bg-card">
              {docs.map((d) => (
                <li key={d.id}>
                  <Link to={`/legal/${d.slug}`} className="flex items-center gap-3 p-4">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{d.title}</span>
                      <span className="block text-sm text-party-gray">{d.summary}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-party-gray" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mt-10 border-t border-border pt-6 text-xs text-party-gray">
          Documento pendiente de revisión legal antes de abrir el servicio al público.
        </p>
      </div>
    </div>
  );
};

export default LegalPage;
