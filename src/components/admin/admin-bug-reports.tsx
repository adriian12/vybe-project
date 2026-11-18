import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, Check, Image as ImageIcon, RotateCcw, X } from 'lucide-react';
import { api, BugReport } from '@/services/api';
import { openExternal } from '@/services/native';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  reports: BugReport[];
  onChange: (id: string, status: BugReport['status']) => void;
}

/** Errores que llegan desde «Reportar error» de Ajustes (migración 138). */
const AdminBugReports = ({ reports, onChange }: Props) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const cambiar = async (report: BugReport, status: BugReport['status']) => {
    setBusy(report.id);
    try {
      await api.setBugReportStatus(report.id, status);
      onChange(report.id, status);
      toast({ title: t(`admin.bugs.done.${status}`) });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const verCaptura = async (path: string) => {
    const url = await api.signedBugCaptureUrl(path);
    if (url) void openExternal(url);
    else toast({ title: t('common.error'), variant: 'destructive' });
  };

  if (reports.length === 0) {
    return (
      <div className="surface-light flex flex-col items-center gap-2 rounded-2xl p-8 text-center text-party-gray">
        <Bug size={22} />
        <p className="text-body-sm">{t('admin.bugs.empty')}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {reports.map((report) => {
        const pendiente = report.status === 'pending';
        const ctx = report.context as { platform?: string; route?: string; screen?: string; language?: string };
        return (
          <li
            key={report.id}
            className={`surface-light rounded-2xl p-4 ${pendiente ? '' : 'opacity-60'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-headline-md">{report.title}</p>
                <p className="text-caption text-party-gray">
                  {[report.reporterName, report.reporterEmail].filter(Boolean).join(' · ') || t('admin.bugs.unknown')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="rounded-md bg-black/[0.06] px-2 py-0.5 text-[10px] font-extrabold uppercase">
                  {t(`admin.reports.status.${report.status}`, { defaultValue: report.status })}
                </span>
                <p className="mt-1 text-caption text-party-gray">
                  {new Date(report.createdAt).toLocaleString(i18n.language, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-black/[0.04] p-3 text-body-sm text-ink/80">
              {report.message}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-party-gray">
              {[ctx.platform, ctx.route, ctx.screen, ctx.language].filter(Boolean).map((dato) => (
                <span key={String(dato)} className="rounded-md bg-black/[0.04] px-2 py-0.5 font-mono">
                  {String(dato)}
                </span>
              ))}
              {report.imagePath && (
                <button
                  type="button"
                  onClick={() => void verCaptura(report.imagePath as string)}
                  className="press inline-flex items-center gap-1 font-semibold text-[#7a6200] underline underline-offset-2"
                >
                  <ImageIcon size={13} />
                  {t('admin.bugs.capture')}
                </button>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {pendiente ? (
                <>
                  <button
                    type="button"
                    disabled={busy === report.id}
                    onClick={() => void cambiar(report, 'dismissed')}
                    className="press flex h-10 items-center justify-center gap-1 rounded-lg border border-black/10 text-caption font-bold text-party-gray disabled:opacity-50"
                  >
                    <X size={14} />
                    {t('admin.reports.dismiss')}
                  </button>
                  <button
                    type="button"
                    disabled={busy === report.id}
                    onClick={() => void cambiar(report, 'resolved')}
                    className="press flex h-10 items-center justify-center gap-1 rounded-lg border border-ink text-caption font-bold disabled:opacity-50"
                  >
                    <Check size={14} />
                    {t('admin.bugs.fixed')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy === report.id}
                  onClick={() => void cambiar(report, 'pending')}
                  className="press col-span-2 flex h-10 items-center justify-center gap-1 rounded-lg border border-black/10 text-caption font-bold text-party-gray disabled:opacity-50"
                >
                  <RotateCcw size={14} />
                  {t('admin.bugs.reopen')}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default AdminBugReports;
