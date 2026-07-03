import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import moment from 'moment';

const WAREHOUSES = ['全部', '上海仓', 'Tucson仓'];

const TYPE_COLORS = {
  inbound:    { label: '入库', color: 'text-green-400 bg-green-400/10', icon: ArrowDownToLine },
  outbound:   { label: '出库', color: 'text-red-400 bg-red-400/10',   icon: ArrowUpFromLine },
  adjustment: { label: '修正', color: 'text-amber-400 bg-amber-400/10', icon: SlidersHorizontal },
};

export default function ProductLedgerPanel({ product, onClose }) {
  const [warehouseFilter, setWarehouseFilter] = useState('全部');

  const { data: inbounds = [] } = useQuery({
    queryKey: ['inbound_records_product', product?.id],
    queryFn: () => base44.entities.InboundRecord.filter({ sku_ref: product.id }),
    enabled: !!product?.id,
  });

  const { data: outbounds = [] } = useQuery({
    queryKey: ['outbound_records_product', product?.id],
    queryFn: () => base44.entities.OutboundRecord.filter({ sku_ref: product.id }),
    enabled: !!product?.id,
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ['adjustments_product', product?.id],
    queryFn: () => base44.entities.StockAdjustment.filter({ sku_ref: product.id }),
    enabled: !!product?.id,
  });

  const { data: stocks = [] } = useQuery({
    queryKey: ['inventory_stocks'],
    queryFn: () => base44.entities.InventoryStock.list(),
    enabled: !!product?.id,
  });

  const ledger = useMemo(() => {
    const entries = [
      ...inbounds.map(r => ({ ...r, _type: 'inbound', _qty: +r.quantity, _date: r.date })),
      ...outbounds.map(r => ({ ...r, _type: 'outbound', _qty: -r.quantity, _date: r.date })),
      ...adjustments.map(r => ({ ...r, _type: 'adjustment', _qty: (r.after_qty || 0) - (r.before_qty || 0), _date: r.date })),
    ];
    entries.sort((a, b) => (b._date || '').localeCompare(a._date || ''));
    return entries;
  }, [inbounds, outbounds, adjustments]);

  const filtered = useMemo(() => {
    if (warehouseFilter === '全部') return ledger;
    return ledger.filter(r => r.warehouse === warehouseFilter);
  }, [ledger, warehouseFilter]);

  const getStock = (wh) => stocks.find(s => s.sku_ref === product?.id && s.warehouse === wh)?.quantity ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-xl bg-card flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-thin border-border flex-shrink-0">
          <div>
            <div className="text-[15px] font-semibold text-foreground">{product?.name}</div>
            {product?.sku_id && <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{product.sku_id}</div>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stock summary */}
        <div className="flex gap-4 px-5 py-3 border-b border-thin border-border flex-shrink-0 bg-muted/20">
          {['上海仓', 'Tucson仓'].map(wh => (
            <div key={wh} className="flex flex-col">
              <span className="text-[11px] text-muted-foreground">{wh}</span>
              <span className="text-[18px] font-bold text-foreground">{getStock(wh)}</span>
            </div>
          ))}
          <div className="flex flex-col ml-auto text-right">
            <span className="text-[11px] text-muted-foreground">合计</span>
            <span className="text-[18px] font-bold text-primary">{getStock('上海仓') + getStock('Tucson仓')}</span>
          </div>
        </div>

        {/* Filter */}
        <div className="px-5 py-2.5 border-b border-thin border-border flex-shrink-0">
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="h-7 text-[12px] w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Ledger entries */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-[13px]">暂无记录</div>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-muted/30 border-b border-thin border-border">
                <tr>
                  <th className="px-4 py-2 text-left text-[11px] font-medium text-muted-foreground">日期</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">类型</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">仓库</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-muted-foreground">数量</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">来源/说明</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const meta = TYPE_COLORS[r._type];
                  const Icon = meta.icon;
                  let source = '';
                  if (r._type === 'inbound') source = r.purchase_order_number || r.supplier || '';
                  else if (r._type === 'outbound') source = r.order_number || r.notes || '';
                  else if (r._type === 'adjustment') source = r.reason || '';
                  return (
                    <tr key={`${r._type}-${r.id}`} className="border-b border-thin border-border hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                        {r._date ? moment(r._date).format('YYYY-MM-DD') : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.color}`}>
                          <Icon className="w-2.5 h-2.5" />
                          {r._type === 'outbound' ? (r.type || meta.label) : meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{r.warehouse || '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${r._qty > 0 ? 'text-green-400' : r._qty < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {r._qty > 0 ? `+${r._qty}` : r._qty}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[160px] truncate">{source || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}