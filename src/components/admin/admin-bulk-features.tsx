import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { adminService, BulkEventFeatures } from '@/services/admin';
import { cn } from '@/lib/utils';

/** Las funciones que se pueden cambiar a la vez, con los textos de «Ajustes de la fiesta». */
const FUNCIONES = [
  ['entry', 'venue.liveSettings.entry.title'],
  ['swipe', 'venue.liveSettings.swipe.title'],
  ['headcount', 'venue.liveSettings.headcount.title'],
  ['genderSplit', 'venue.liveSettings.genderSplit.title'],
  ['guestList', 'venue.liveSettings.guestList.title'],
] as const;

type Clave = (typeof FUNCIONES)[number][0];
/** `null`: se queda como esté en cada fiesta. */
type Valor = boolean | null;

interface AdminBulkFeaturesProps {
  ids: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

/**
 * Eventos → «Activar funciones»: encender o apagar funciones en todas las
 * fiestas marcadas de una vez (migración 121). Cada función empieza en «Igual»
 * y sólo se toca lo que se cambie.
 */
const AdminBulkFeatures = ({ ids, open, onOpenChange, onDone }: AdminBulkFeaturesProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [valores, setValores] = useState<Record<Clave, Valor>>({
    entry: null,
    swipe: null,
    headcount: null,
    genderSplit: null,
    guestList: null,
  });
  const [guardando, setGuardando] = useState(false);

  const algo = Object.values(valores).some((v) => v !== null);
  const cambiar = (clave: Clave, valor: Valor) =>
    setValores((prev) => {
      const nuevo = { ...prev, [clave]: valor };
      // El swipe necesita «Entrar al evento»: encenderlo lo enciende también.
      if (clave === 'swipe' && valor === true && nuevo.entry === false) nuevo.entry = true;
      if (clave === 'entry' && valor === false) nuevo.swipe = false;
      return nuevo;
    });

  const aplicar = async () => {
    setGuardando(true);
    try {
      const n = await adminService.setEventsFeatures(ids, valores as BulkEventFeatures);
      toast({ title: t('admin.events.bulk.done', { count: n }) });
      setValores({ entry: null, swipe: null, headcount: null, genderSplit: null, guestList: null });
      onOpenChange(false);
      onDone();
    } catch {
      toast({ title: t('common.error'), description: t('errors.generic'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="surface-light !bg-white text-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('admin.events.bulk.title')}</DialogTitle>
          <DialogDescription>{t('admin.events.bulk.body', { count: ids.length })}</DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-black/[0.06]">
          {FUNCIONES.map(([clave, etiqueta]) => (
            <li key={clave} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-body-sm font-bold">{t(etiqueta)}</span>
              <div className="flex shrink-0 rounded-lg bg-black/[0.05] p-0.5" role="radiogroup" aria-label={t(etiqueta)}>
                {(
                  [
                    [null, 'admin.events.bulk.keep'],
                    [true, 'admin.events.bulk.on'],
                    [false, 'admin.events.bulk.off'],
                  ] as const
                ).map(([valor, texto]) => (
                  <button
                    key={String(valor)}
                    type="button"
                    role="radio"
                    aria-checked={valores[clave] === valor}
                    onClick={() => cambiar(clave, valor)}
                    className={cn(
                      'press h-8 rounded-md px-2.5 text-caption font-bold',
                      valores[clave] === valor
                        ? valor === true
                          ? 'bg-party-primary text-ink'
                          : valor === false
                            ? 'bg-ink text-white'
                            : 'bg-white text-ink shadow-sm'
                        : 'text-ink/60',
                    )}
                  >
                    {t(texto)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={!algo || guardando || ids.length === 0}
          onClick={() => void aplicar()}
          className="press flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-display text-title-card text-ink disabled:opacity-40"
        >
          {guardando && <Loader2 size={16} className="animate-spin" />}
          {t('admin.events.bulk.apply', { count: ids.length })}
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default AdminBulkFeatures;
