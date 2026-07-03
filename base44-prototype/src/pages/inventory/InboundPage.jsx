import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import InboundFormDialog from '@/components/inventory/InboundFormDialog';
import { useI18n } from '@/lib/i18nContext';
import moment from 'moment';

const WAREHOUSES = ['全部', '上海仓', 'Tucson仓'];

export default function InboundPage({ currentUser, onNavigateToPO }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [warehouseFilter, setWarehouseFilter] = useState('全部');

  const { data: records = [] } = useQuery({
    queryKey: ['inbound_records'],
    queryFn: () => base44.entities.InboundRecord.list('-date', 500),
  });

  const filtered = useMemo(() => {
    if (warehouseFilter === '全部') return records;
    return records.filter(r => r.warehouse === warehouseFilter);
  }, [records, warehouseFilter]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[18px] font-semibold text-foreground">{t('inv_inbound')}</h1>
        <Button onClick={() => setShowForm(true)} className="h-8 text-[12px] gap-1.5">
          <Plus className="w-3.5 h-3.5" /> {t('inv_new_inbound')}
        </Button>
      </div>

      {/* Warehouse toggle */}
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

      <div className="rounded-xl border border-thin border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-thin border-border bg-muted/30">
              {[t('bill_date'), '仓库', t('inv_name'), t('po_quantity'), '供应商', '采购单', '操作人', t('settlement_notes')].map(h => (
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
                <td className="px-4 py-2.5 font-semibold text-green-400">+{r.quantity}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.supplier || '-'}</td>
                <td className="px-4 py-2.5 font-mono text-[11px]">
                  {r.po_ref_id && onNavigateToPO ? (
                    <button className="text-primary hover:underline" onClick={() => onNavigateToPO(r.po_ref_id)}>
                      {r.purchase_order_number || r.po_ref_id}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">{r.purchase_order_number || '-'}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.operator_name || '-'}</td>
                <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{r.notes || '-'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-[13px]">暂无入库记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <InboundFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        currentUser={currentUser}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['inbound_records'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
        }}
      />
    </div>
  );
}