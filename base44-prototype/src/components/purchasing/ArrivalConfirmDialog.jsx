import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import moment from 'moment';

export default function ArrivalConfirmDialog({ open, onClose, po, lines, currentUser, onConfirmed }) {
  const [arrivalQtys, setArrivalQtys] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && lines) {
      const init = {};
      lines.forEach(l => { init[l.id] = l.quantity; });
      setArrivalQtys(init);
    }
  }, [open, lines]);

  const handleConfirm = async () => {
    setSaving(true);
    await base44.entities.PurchaseOrder.update(po.id, {
      production_status: '已收货',
      actual_arrival_date: moment().format('YYYY-MM-DD'),
    });

    // Create inbound records
    for (const line of lines) {
      const qty = Number(arrivalQtys[line.id] || line.quantity);
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
        notes: `自动同步入库: ${po.po_number}`,
      });
      // Update stock if sku_ref exists
      if (line.sku_ref) {
        const products = await base44.entities.Product.filter({ id: line.sku_ref });
        if (products.length > 0) {
          const p = products[0];
          await base44.entities.Product.update(p.id, { current_stock: (p.current_stock || 0) + qty });
        }
      }
    }

    setSaving(false);
    onConfirmed();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-[15px] font-semibold">核对到货数量 — {po.po_number}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4">
          <p className="text-[12px] text-muted-foreground">请核对实际到货数量，确认后将自动同步入库</p>
          <div className="space-y-2">
            {lines.map(line => (
              <div key={line.id} className="flex items-center gap-3 text-[13px]">
                <span className="flex-1 text-foreground">{line.product_name}</span>
                <span className="text-muted-foreground text-[12px]">下单: {line.quantity}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">到货:</span>
                  <Input
                    type="number"
                    min="0"
                    value={arrivalQtys[line.id] ?? line.quantity}
                    onChange={e => setArrivalQtys(prev => ({ ...prev, [line.id]: e.target.value }))}
                    className="h-7 text-[12px] w-16"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleConfirm} disabled={saving} className="h-8 text-[12px]">
              {saving ? '同步中...' : '同步入库'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}