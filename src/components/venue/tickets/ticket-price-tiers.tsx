import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, TrendingUp, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { PriceTier, salesDashboardService } from '@/services/sales-dashboard';

/**
 * Saltos de precio de un tipo de entrada (Business, migración 131): «los
 * primeros 100 a 10 €» o «hasta el jueves a 12 €». Después vale el precio de
 * la entrada. Se guardan aparte del formulario y los aplica la base de datos
 * al reservar.
 */

interface Props {
  /** Sin id (entrada nueva) aún no se pueden añadir. */
  typeId: string | null;
}

interface Fila {
  price: string;
  upTo: string;
  until: string;
}

const MAX = 5;

const aFila = (t: PriceTier): Fila => {
  let until = '';
  if (t.until_at) {
    const d = new Date(t.until_at);
    until = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
  return { price: (t.price_cents / 100).toString().replace('.', ','), upTo: t.up_to ? String(t.up_to) : '', until };
};

const TicketPriceTiers = ({ typeId }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!typeId) return;
    let vivo = true;
    setCargando(true);
    salesDashboardService
      .getTiers(typeId)
      .then((tiers) => vivo && setFilas(tiers.map(aFila)))
      .catch(() => undefined)
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [typeId]);

  const cambiar = (i: number, campo: keyof Fila, valor: string) =>
    setFilas((f) => f.map((fila, j) => (j === i ? { ...fila, [campo]: valor } : fila)));

  const guardar = async () => {
    if (!typeId) return;
    const tiers: PriceTier[] = [];
    for (const f of filas) {
      const euros = Number(f.price.replace(',', '.'));
      const upTo = f.upTo.trim() ? Number(f.upTo) : null;
      const until = f.until ? new Date(f.until).toISOString() : null;
      if (!upTo && !until) {
        toast({ title: t('sales.tiers.needLimit'), variant: 'destructive' });
        return;
      }
      tiers.push({ price_cents: Math.round(euros * 100), up_to: upTo, until_at: until });
    }
    setGuardando(true);
    try {
      await salesDashboardService.saveTiers(typeId, tiers);
      toast({ title: t('sales.tiers.saved') });
    } catch {
      toast({ title: t('sales.tiers.invalid'), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-black/10 p-3">
      <p className="flex items-center gap-1.5 text-body-sm font-bold">
        <TrendingUp size={15} />
        {t('sales.tiers.title')}
      </p>
      <p className="text-caption text-party-gray">{typeId ? t('sales.tiers.help') : t('sales.tiers.saveFirst')}</p>

      {typeId && cargando && <Loader2 size={16} className="animate-spin text-party-gray" />}

      {typeId && !cargando && (
        <>
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] items-end gap-2">
              <label className="text-caption">
                {t('sales.tiers.price')}
                <Input inputMode="decimal" value={f.price} onChange={(e) => cambiar(i, 'price', e.target.value)} />
              </label>
              <label className="text-caption">
                {t('sales.tiers.upTo')}
                <Input inputMode="numeric" value={f.upTo} onChange={(e) => cambiar(i, 'upTo', e.target.value.replace(/\D/g, ''))} />
              </label>
              <label className="text-caption">
                {t('sales.tiers.until')}
                <Input type="datetime-local" value={f.until} onChange={(e) => cambiar(i, 'until', e.target.value)} />
              </label>
              <button
                type="button"
                onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
                aria-label={t('sales.tiers.remove')}
                className="press mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-party-gray hover:text-destructive"
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            {filas.length < MAX && (
              <button
                type="button"
                onClick={() => setFilas((fs) => [...fs, { price: '', upTo: '', until: '' }])}
                className="press flex h-9 items-center gap-1 rounded-lg border border-dashed border-black/20 px-3 text-caption font-bold"
              >
                <Plus size={14} />
                {t('sales.tiers.add')}
              </button>
            )}
            <button
              type="button"
              disabled={guardando}
              onClick={() => void guardar()}
              className="press flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-caption font-bold text-white disabled:opacity-50"
            >
              {guardando && <Loader2 size={13} className="animate-spin" />}
              {t('sales.tiers.save')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default TicketPriceTiers;
