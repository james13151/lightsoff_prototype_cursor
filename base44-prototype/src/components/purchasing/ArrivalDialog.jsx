import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import moment from 'moment';

export default function ArrivalDialog({ open, onClose, po, lines, currentUser, onConfirmed }) {
  const [qtys, setQtys] = useState({});
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    for (const line of lines) {
      const qty = Number(qtys[line.id] ?? line.quantity);
      if (qty <= 0) continue;
      await base44.entities.InboundRecord.create({
        date: moment().format('YYYY-MM-DD'),
        sku_ref: line.sku_ref || '',
        sku_name: line.product_name,
        quantity: qty,
        supplier: po.supplier_name,
        purchase_order_number: po.po_number,
        operator_id: currentUser?.id,
        operator_name: currentUser?.full_name,
        notes: `来自采购单 ${po.po_number}`,
      });
      // Update product stock if sku_ref provided
      if (line.sku_ref) {
        const products = await base44.entities.Product.filter({ id: line.sku_ref });
        if (products[0]) {
          await base44.entities.Product.update(line.sku_ref, { current_stock: (products[0].current_stock || 0) + qty });
        }
      }
    }
    await base44.entities.PurchaseOrder.update(po.id, {
      production_status: '已收货',
      actual_arrival_date: moment().format('YYYY-MM-DD'),
    });
    setSaving(false);
    onConfirmed?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-thin border-border">
          <DialogTitle className="text-[15px] font-semibold">核对到货数量 — 同步入库</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 pt-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <p className="text-[12px] text-muted-foreground">请核对实际到货数量，确认后将自动创建入库记录。</p>
          {lines.map(line => (
            <div key={line.id} className="flex items-center gap-3 text-[13px]">
              <span className="flex-1 text-foreground">{line.product_name}</span>
              <span className="text-muted-foreground text-[12px]">预计: {line.quantity}</span>
              <Input
                type="number"
                min="0"
                defaultValue={line.quantity}
                onChange={e => setQtys(q => ({ ...q, [line.id]: e.target.value }))}
                className="h-7 text-[12px] w-20"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleConfirm} disabled={saving} className="h-8 text-[12px] gap-1.5">
              {saving ? '同步中...' : '同步入库'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}