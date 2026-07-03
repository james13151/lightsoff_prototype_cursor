import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import WarehouseTransferDialog from '@/components/inventory/WarehouseTransferDialog';
import moment from 'moment';

export default function WarehouseTransferPage({ currentUser }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: records = [] } = useQuery({
    queryKey: ['warehouse_transfers'],
    queryFn: () => base44.entities.WarehouseTransfer.list('-date', 500),
  });

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[18px] font-semibold text-foreground">仓位调拨</h1>
        <Button onClick={() => setShowForm(true)} className="h-8 text-[12px] gap-1.5">
          <Plus className="w-3.5 h-3.5" /> 新增调拨
        </Button>
      </div>

      <div className="rounded-xl border border-thin border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-thin border-border bg-muted/30">
              {['日期', '产品', '数量', '来源仓位', '目标仓位', '操作员', '备注'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="border-b border-thin border-border hover:bg-white/[0.03]">
                <td className="px-4 py-2.5 text-muted-foreground">{moment(r.date).format('YYYY-MM-DD')}</td>
                <td className="px-4 py-2.5 font-medium text-foreground">{r.sku_name || r.sku_ref}</td>
                <td className="px-4 py-2.5 font-semibold text-foreground">{r.quantity}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.from_location || '-'}</td>
                <td className="px-4 py-2.5 text-foreground">{r.to_location || '-'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.operator_name || '-'}</td>
                <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{r.notes || '-'}</td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-[13px]">暂无调拨记录</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <WarehouseTransferDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        currentUser={currentUser}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['warehouse_transfers'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
        }}
      />
    </div>
  );
}