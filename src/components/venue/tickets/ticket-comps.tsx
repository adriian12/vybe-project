import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, Loader2, Mail, Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ApiError } from '@/services/api';
import { TicketOrder, TicketSale, ticketsService } from '@/services/tickets';

/**
 * Ventas → Gestión de entradas → Invitaciones: entradas de 0 € que el
 * negocio regala a alguien (artistas, prensa, amigos de la casa). Cuentan para
 * el aforo, llevan su QR y su PDF, llegan por correo y se validan en la puerta
 * como cualquier entrada. Si el correo es de una cuenta de Fiestea, salen
 * también en su pestaña «Entradas».
 */

interface Props {
  ventas: TicketSale[];
  pedidos: TicketOrder[];
  eventEnded: boolean;
  busy: string | null;
  onIssued: () => void;
  onResend: (pedido: TicketOrder) => void;
}

const MAX = 20;

const TicketComps = ({ ventas, pedidos, eventEnded, busy, onIssued, onResend }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const tipos = ventas.filter((v) => v.capacity === null || v.sold < v.capacity);
  const [typeId, setTypeId] = useState<string>('');
  const [cantidad, setCantidad] = useState(1);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  const elegido = tipos.find((v) => v.id === typeId) ?? tipos[0] ?? null;
  const quedan = elegido?.capacity !== null && elegido ? elegido.capacity - elegido.sold : null;
  const tope = Math.min(MAX, quedan ?? MAX);
  const emitidas = useMemo(() => pedidos.filter((p) => p.source === 'comp'), [pedidos]);
  const correoValido = !correo.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim());

  const emitir = async () => {
    if (!elegido || nombre.trim().length < 2 || !correoValido) return;
    setEnviando(true);
    try {
      const r = await ticketsService.issueComps({
        typeId: elegido.id,
        quantity: Math.min(cantidad, tope),
        name: nombre.trim(),
        email: correo.trim() || null,
        note: nota.trim() || null,
      });
      toast({
        title: t('sales.manage.comps.issued', { count: cantidad }),
        description: r.emailed ? t('sales.manage.comps.emailed', { email: correo.trim() }) : t('sales.manage.comps.noEmailSent'),
      });
      setNombre('');
      setCorreo('');
      setNota('');
      setCantidad(1);
      onIssued();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t(error instanceof ApiError ? error.message : 'errors.generic'),
        variant: 'destructive',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="surface-light space-y-4 rounded-2xl p-4 lg:col-span-5">
        <div>
          <h3 className="font-display text-title-card uppercase tracking-wide">{t('sales.manage.comps.title')}</h3>
          <p className="mt-1 text-caption text-party-gray">{t('sales.manage.comps.help')}</p>
        </div>

        {eventEnded ? (
          <p className="text-body-sm text-party-gray">{t('sales.ended')}</p>
        ) : tipos.length === 0 ? (
          <p className="text-body-sm text-party-gray">{ventas.length === 0 ? t('sales.manage.comps.noTypes') : t('sales.manage.comps.full')}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="comp-type">{t('sales.manage.comps.type')}</Label>
              <Select value={elegido?.id} onValueChange={(v) => { setTypeId(v); setCantidad(1); }}>
                <SelectTrigger id="comp-type" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.capacity !== null ? ` · ${t('sales.manage.comps.left', { count: v.capacity - v.sold })}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('sales.manage.comps.quantity')}</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCantidad((n) => Math.max(1, n - 1))}
                  disabled={cantidad <= 1}
                  className="press flex h-10 w-10 items-center justify-center rounded-full border border-black/15 disabled:opacity-40"
                  aria-label={t('sales.manage.comps.less')}
                >
                  <Minus size={16} />
                </button>
                <span className="w-8 text-center font-display text-headline-md tabular">{Math.min(cantidad, tope)}</span>
                <button
                  type="button"
                  onClick={() => setCantidad((n) => Math.min(tope, n + 1))}
                  disabled={cantidad >= tope}
                  className="press flex h-10 w-10 items-center justify-center rounded-full border border-black/15 disabled:opacity-40"
                  aria-label={t('sales.manage.comps.more')}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="comp-name">{t('sales.manage.comps.name')}</Label>
              <Input id="comp-name" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-email">{t('sales.manage.comps.email')}</Label>
              <Input
                id="comp-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                aria-invalid={!correoValido}
              />
              <p className="text-caption text-party-gray">{t('sales.manage.comps.emailHelp')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-note">{t('sales.manage.comps.note')}</Label>
              <Input
                id="comp-note"
                maxLength={200}
                placeholder={t('sales.manage.comps.notePlaceholder')}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={() => void emitir()}
              disabled={enviando || nombre.trim().length < 2 || !correoValido}
              className="press flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-party-primary font-bold text-ink disabled:opacity-50"
            >
              {enviando ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
              {t('sales.manage.comps.submit', { count: Math.min(cantidad, tope) })}
            </button>
          </>
        )}
      </div>

      <div className="surface-light rounded-2xl p-4 lg:col-span-7">
        <h3 className="mb-3 font-display text-title-card uppercase tracking-wide">
          {t('sales.manage.comps.list')} · {emitidas.reduce((n, p) => n + p.quantity, 0)}
        </h3>
        {emitidas.length === 0 ? (
          <p className="text-body-sm text-party-gray">{t('sales.manage.comps.none')}</p>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {emitidas.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-bold">
                    {p.buyer || '—'} · {p.quantity} × {p.typeName}
                  </p>
                  <p className="truncate text-caption text-party-gray">
                    {[p.buyerEmail, p.note, t('sales.manage.usedOf', { used: p.used, total: p.quantity })].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {p.buyerEmail && p.status === 'paid' && (
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => onResend(p)}
                    className="press flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black/15 px-3 text-caption font-bold disabled:opacity-40"
                  >
                    {busy === p.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                    <span className="hidden sm:inline">{t('sales.manage.resend')}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TicketComps;
