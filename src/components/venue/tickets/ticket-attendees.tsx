import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, Gift, Loader2, RotateCcw, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { TicketAttendee, ticketsService } from '@/services/tickets';
import { downloadCsv, slugFichero } from '@/lib/csv';
import { cn } from '@/lib/utils';

/**
 * Ventas → Gestión de entradas → Asistentes: una fila por entrada emitida,
 * con quién la lleva, su tipo y si ya ha entrado. Sirve de lista de puerta:
 * se busca por nombre, correo o código, se marca la entrada a mano (quien
 * llega sin móvil) o se deshace un error, y se exporta a CSV.
 */

type Estado = 'all' | 'valid' | 'used' | 'refunded';

interface Props {
  eventId: string;
  eventName: string;
  /** Cambia cuando hay que volver a cargar (una invitación nueva, una devolución). */
  version: number;
  onChanged: () => void;
}

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const TicketAttendees = ({ eventId, eventName, version, onChanged }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [asistentes, setAsistentes] = useState<TicketAttendee[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<Estado>('all');
  const [tipo, setTipo] = useState('all');
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Sólo se recarga al cambiar de fiesta o de `version`: si dependiera de `t` o
  // de `toast`, un cambio de identidad volvería a pedir la lista y pisaría el
  // check-in que se acaba de marcar.
  const avisar = useRef({ t, toast });
  avisar.current = { t, toast };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setAsistentes(await ticketsService.getAttendees(eventId));
    } catch (error) {
      const { t: tr, toast: aviso } = avisar.current;
      aviso({
        title: tr('common.error'),
        description: tr(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setCargando(false);
    }
  }, [eventId]);

  useEffect(() => {
    void cargar();
  }, [cargar, version]);

  const tipos = useMemo(() => [...new Set(asistentes.map((a) => a.typeName))].sort(), [asistentes]);
  const vigentes = asistentes.filter((a) => a.status !== 'refunded');
  const dentro = vigentes.filter((a) => a.status === 'used').length;

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return asistentes.filter((a) => {
      if (estado !== 'all' && a.status !== estado) return false;
      if (tipo !== 'all' && a.typeName !== tipo) return false;
      if (!q) return true;
      return [a.holderName, a.holderEmail, a.code, a.buyer, a.holderPhone].some((v) => v?.toLowerCase().includes(q));
    });
  }, [asistentes, busqueda, estado, tipo]);

  const marcar = async (a: TicketAttendee, entra: boolean) => {
    setOcupado(a.id);
    try {
      const r = await ticketsService.setCheckedIn(a.id, entra);
      setAsistentes((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: r.status, usedAt: r.usedAt } : x)));
      onChanged();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setOcupado(null);
    }
  };

  const exportar = () =>
    downloadCsv(`asistentes-${slugFichero(eventName)}`, [
      ['Nombre', 'Correo', 'Teléfono', 'Tipo', 'Código', 'Estado', 'Entrada', 'Origen', 'Comprador'],
      ...lista.map((a) => [
        a.holderName,
        a.holderEmail ?? '',
        a.holderPhone ?? '',
        a.typeName,
        a.code,
        a.status === 'used' ? 'Dentro' : a.status === 'refunded' ? 'Devuelta' : 'Pendiente',
        a.usedAt ? new Date(a.usedAt).toLocaleString() : '',
        a.source === 'comp' ? 'Invitación' : 'Online',
        a.buyer,
      ]),
    ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t('sales.manage.attendees.issued'), value: vigentes.length },
          { label: t('sales.manage.attendees.inside'), value: dentro },
          { label: t('sales.manage.attendees.pending'), value: vigentes.length - dentro },
        ].map((k) => (
          <div key={k.label} className="surface-light rounded-2xl p-4">
            <p className="font-display text-headline-md tabular">{k.value}</p>
            <p className="mt-1 text-caption uppercase tracking-wide text-party-gray">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="surface-light space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-party-gray" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('sales.manage.attendees.search')}
              className="h-10 pl-9"
              aria-label={t('sales.manage.attendees.search')}
            />
          </div>
          <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
            <SelectTrigger className="h-10 w-[150px]" aria-label={t('sales.manage.attendees.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('sales.manage.attendees.all')}</SelectItem>
              <SelectItem value="valid">{t('sales.manage.attendees.statusValid')}</SelectItem>
              <SelectItem value="used">{t('sales.manage.attendees.statusUsed')}</SelectItem>
              <SelectItem value="refunded">{t('sales.manage.attendees.statusRefunded')}</SelectItem>
            </SelectContent>
          </Select>
          {tipos.length > 1 && (
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="h-10 w-[160px]" aria-label={t('sales.manage.attendees.type')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('sales.manage.attendees.allTypes')}</SelectItem>
                {tipos.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            type="button"
            onClick={exportar}
            disabled={lista.length === 0}
            className="press flex h-10 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold disabled:opacity-40"
          >
            <Download size={14} />
            CSV
          </button>
        </div>

        {cargando ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-party-primary" />
          </div>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-party-gray">
            {asistentes.length === 0 ? t('sales.manage.attendees.empty') : t('sales.manage.noMatches')}
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {lista.map((a) => (
              <li key={a.id} className={cn('flex items-center gap-3 py-2.5', a.status === 'refunded' && 'opacity-50')}>
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-caption font-bold',
                    a.status === 'used' ? 'bg-emerald-100 text-emerald-800' : 'bg-black/[0.06] text-party-gray',
                  )}
                  aria-hidden
                >
                  {a.status === 'used' ? <Check size={16} /> : (a.holderName || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-bold">
                    {a.holderName || '—'}
                    {a.source === 'comp' && <Gift size={12} className="ml-1.5 inline text-amber-600" aria-label={t('sales.manage.comp')} />}
                  </p>
                  <p className="truncate text-caption text-party-gray">
                    {a.typeName} · <span className="tabular">{a.code}</span>
                    {a.status === 'used' && a.usedAt ? ` · ${t('sales.manage.attendees.inAt', { time: hora(a.usedAt) })}` : ''}
                    {a.status === 'refunded' ? ` · ${t('sales.manage.attendees.statusRefunded')}` : ''}
                  </p>
                </div>
                {a.status !== 'refunded' &&
                  (a.status === 'used' ? (
                    <button
                      type="button"
                      disabled={ocupado === a.id}
                      onClick={() => void marcar(a, false)}
                      className="press flex h-9 shrink-0 items-center gap-1 rounded-lg border border-black/15 px-2.5 text-caption font-bold disabled:opacity-40"
                      title={t('sales.manage.attendees.undo')}
                    >
                      {ocupado === a.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                      <span className="hidden sm:inline">{t('sales.manage.attendees.undo')}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={ocupado === a.id}
                      onClick={() => void marcar(a, true)}
                      className="press flex h-9 shrink-0 items-center gap-1 rounded-lg bg-party-primary px-3 text-caption font-bold text-ink disabled:opacity-40"
                    >
                      {ocupado === a.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {t('sales.manage.attendees.checkIn')}
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TicketAttendees;
