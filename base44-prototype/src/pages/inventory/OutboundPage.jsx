import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import OutboundFormDialog from '@/components/inventory/OutboundFormDialog';
import { isPartner } from '@/lib/permissions';
import { useI18n } from '@/lib/i18nContext';
import moment from 'moment';

const TYPE_COLORS = {
  '销售出库': 'text-blue-400 bg-blue-400/10',
  '退货出库': 'text-amber-400 bg-amber-400/10',
  '调拨出库': 'text-purple-400 bg-purple-400/10',
};
const FULFILLMENT_COLORS = {
  '待出库': 'text-amber-400 bg-amber-400/10',
  '出库中': 'text-blue-400 bg-blue-400/10',
  '已发货': 'text-green-400 bg-green-400/10',
};
const WAREHOUSES = ['全部', '上海仓', 'Tucson仓'];

export default function OutboundPage({ currentUser }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const userIsPartner = isPartner(currentUser);
  const [showForm, setShowForm] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState(userIsPartner ? 'Tucson仓' : '全部');

  const { data: records = [] } = useQuery({
    queryKey: ['outbound_records'],
    queryFn: () => base44.entities.OutboundRecord.list('-date', 500),
  });

  const filtered = useMemo(() => {
    if (warehouseFilter === '全部') return records;
    return records.filter(r => r.warehouse === warehouseFilter);
  }, [records, warehouseFilter]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-semibold text-foreground">{t('inv_outbound')}</h1>
        {!userIsPartner && (
          <Button onClick={() => setShowForm(true)} className="h-8 text-[12px] gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {t('inv_new_outbound')}
          </Button>
        )}
      </div>

      {/* Warehouse toggle */}
      {!userIsPartner && (
        <div className="flex gap-1 mb-4">
          {[
            { key: '全部', label: t('all_warehouses') },
            { key: '上海仓', label: t('warehouse_shanghai') },
            { key: 'Tucson仓', label: t('warehouse_tucson') },
          ].map(w => (
            <button
              key={w.key}
              onClick={() => setWarehouseFilter(w.key)}
              className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors ${
                warehouseFilter === w.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-thin border-border overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-thin border-border bg-muted/30">
              {[t('bill_date'), 'Warehouse', t('inv_name'), t('po_quantity'), 'Type', 'Order No.', t('fulfillment_tracking'), 'Fulfillment Status', 'Operator'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-thin border-border hover:bg-white/[0.03]">
                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{moment(r.date).format('YYYY-MM-DD')}</td>
                <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{r.warehouse || '-'}</td>
                <td className="px-4 py-2.5 font-medium text-foreground">{r.sku_name || r.sku_ref}</td>
                <td className="px-4 py-2.5 font-semibold text-red-400">-{r.quantity}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${TYPE_COLORS[r.type] || ''}`}>{r.type}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{r.order_number || '-'}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{r.tracking_number || '-'}</td>
                <td className="px-4 py-2.5">
                  {r.fulfillment_status ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${FULFILLMENT_COLORS[r.fulfillment_status] || ''}`}>{r.fulfillment_status}</span>
                  ) : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.operator_name || '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-[13px]">暂无出库记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <OutboundFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        currentUser={currentUser}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['outbound_records'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
        }}
      />
    </div>
  );
}