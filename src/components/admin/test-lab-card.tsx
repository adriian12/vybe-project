import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Loader2, LocateFixed } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAppContext } from '@/context/app-context';
import { ApiError } from '@/services/api';
import { getCurrentPosition, GeolocationError } from '@/services/geo';
import { testLabService, TestLabResult } from '@/services/test-lab';

/**
 * La sala de pruebas, desde el resumen de administración.
 *
 * Un botón: coge la ubicación real del teléfono y lleva allí la sala del seed,
 * con su fiesta en marcha y 35 personas dentro. Así se prueba geocerca, QR,
 * tablón y matches desde cualquier sitio, sin ir a un local.
 */
const TestLabCard = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { refreshEvents } = useAppContext();

  const [busy, setBusy] = useState(false);
  const [resetSwipes, setResetSwipes] = useState(false);
  const [result, setResult] = useState<TestLabResult | null>(null);

  const mover = async () => {
    setBusy(true);
    try {
      const { latitude, longitude } = await getCurrentPosition();
      const data = await testLabService.moveHere(latitude, longitude, resetSwipes);
      setResult(data);
      await refreshEvents();
      toast({ title: t('admin.testLab.moved'), description: t('admin.testLab.movedBody', { code: data.accessCode }) });
    } catch (error) {
      toast({
        title: t('common.error'),
        description:
          error instanceof GeolocationError
            ? error.message
            : t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface-light mt-5 rounded-2xl p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-party-primary text-ink">
          <FlaskConical size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-headline-md">{t('admin.testLab.title')}</h2>
          <p className="text-body-sm text-party-gray">{t('admin.testLab.body')}</p>
        </div>
      </div>

      {result && (
        <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-black/[0.04] p-3 text-center">
          <div>
            <dt className="text-caption uppercase text-party-gray">{t('admin.testLab.code')}</dt>
            <dd className="font-mono text-headline-md font-bold tracking-wider">{result.accessCode}</dd>
          </div>
          <div>
            <dt className="text-caption uppercase text-party-gray">{t('admin.testLab.inside')}</dt>
            <dd className="font-display text-headline-md">{result.peopleInside}</dd>
          </div>
          <div>
            <dt className="text-caption uppercase text-party-gray">{t('admin.testLab.likes')}</dt>
            <dd className="font-display text-headline-md">{result.likesForYou}</dd>
          </div>
        </dl>
      )}

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-body-sm">
        <input
          type="checkbox"
          checked={resetSwipes}
          onChange={(e) => setResetSwipes(e.target.checked)}
          className="h-4 w-4 accent-[#111114]"
        />
        {t('admin.testLab.resetSwipes')}
      </label>

      <button
        type="button"
        onClick={() => void mover()}
        disabled={busy}
        className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card text-ink disabled:opacity-60"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
        {t('admin.testLab.move')}
      </button>
      <p className="mt-2 text-caption text-party-gray">{t('admin.testLab.help')}</p>
    </section>
  );
};

export default TestLabCard;
