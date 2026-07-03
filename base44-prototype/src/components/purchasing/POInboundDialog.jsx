import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PackagePlus } from 'lucide-react';
import moment from 'moment';
import { toast } from 'sonner';
import { syncStockForProduct } from '@/lib/stockUtils';

const WAREHOUSES = ['上海仓', 'Tucson仓'];

// Compute receipt status from lines + inbound records
export function computeReceiptStatus(lines, inboundRecords, closed = false) {
  if (!lines.length) return '未收货';
  const totalOrdered = lines.reduce((s, l) => s + (l.quantity || 0), 0);
  const totalReceived = inboundRecords
    .filter(r => lines.some(l => l.id === r.po_line_ref))
    .reduce((s, r) => s + (r.quantity || 0), 0);
  if (totalReceived === 0) return closed ? '关闭' : '未收货';
  if (totalReceived >= totalOrdered) return '收货完成';
  return closed ? '关闭' : '部分收货';
}

export default function POInboundDialog({ open, onClose, po, lines, currentUser, onSaved }) {
  const queryClient = useQueryClient();
  const [warehouse, setWarehouse] = useState(po?.receiving_warehouse || '上海仓');
  const [date, setDate] = useState(moment().format('YYYY-MM-DD'));
  const [qtys, setQtys] = useState({});
  const [saving, setSaving] = useState(false);

  // Fetch existing inbound records for this PO
  const { data: existingInbound = [] } = useQuery({
    queryKey: ['inbound_by_po', po?.id],
    queryFn: () => base44.entities.InboundRecord.filter({ po_ref_id: po.id }),
    enabled: open && !!po?.id,
  });

  // Calculate already received per line
  const receivedPerLine = {};
  existingInbound.forEach(r => {
    if (r.po_line_ref) {
      receivedPerLine[r.po_line_ref] = (receivedPerLine[r.po_line_ref] || 0) + r.quantity;
    }
  });

  const getRemaining = (line) => Math.max(0, (line.quantity || 0) - (receivedPerLine[line.id] || 0));
  const getQty = (lineId) => qtys[lineId] !== undefined ? qtys[lineId] : getRemaining(lines.find(l => l.id === lineId));

  const handleConfirm = async () => {
    setSaving(true);
    const newRecords = [];
    for (const line of lines) {
      const qty = Number(getQty(line.id) ?? 0);
      if (qty <= 0) continue;
      const rec = await base44.entities.InboundRecord.create({
        date,
        sku_ref: line.sku_ref || '',
        sku_name: line.product_name,
        quantity: qty,
        supplier: po.supplier_name,
        purchase_order_number: po.po_number,
        po_ref_id: po.id,
        po_line_ref: line.id,
        warehouse,
        operator_id: currentUser?.id,
        operator_name: currentUser?.full_name,
        notes: `来自采购单 ${po.po_number}`,
      });
      newRecords.push(rec);

      // Sync InventoryStock from all records
      if (line.sku_ref) {
        await syncStockForProduct(line.sku_ref, warehouse);
      }
    }

    // Recalculate receipt status
    const allInbound = [...existingInbound, ...newRecords];
    const newStatus = computeReceiptStatus(lines, allInbound);
    await base44.entities.PurchaseOrder.update(po.id, {
      receipt_status: newStatus,
      receiving_warehouse: warehouse,
      actual_arrival_date: date,
    });

    queryClient.invalidateQueries({ queryKey: ['inbound_by_po', po.id] });
    queryClient.invalidateQueries({ queryKey: ['inbound_records'] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    queryClient.invalidateQueries({ queryKey: ['po', po.id] });
    queryClient.invalidateQueries({ queryKey: ['inventory_stocks'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });

    setSaving(false);
    toast.success('入库记录已保存');
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-thin border-border">
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <PackagePlus className="w-4 h-4" /> 入库操作 — {po?.po_number}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 pt-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">入库日期</p>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-[12px]" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">收货仓库 *</p>
              <Select value={warehouse} onValueChange={setWarehouse}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-thin border-border overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-thin border-border bg-muted/30">
                  <th className="px-3 py-2 text-left text-[11px] text-muted-foreground">产品</th>
                  <th className="px-3 py-2 text-right text-[11px] text-muted-foreground">订购</th>
                  <th className="px-3 py-2 text-right text-[11px] text-muted-foreground">已收</th>
                  <th className="px-3 py-2 text-right text-[11px] text-muted-foreground">待收</th>
                  <th className="px-3 py-2 text-right text-[11px] text-muted-foreground">本次入库</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(line => {
                  const received = receivedPerLine[line.id] || 0;
                  const remaining = getRemaining(line);
                  return (
                    <tr key={line.id} className="border-b border-thin border-border last:border-0">
                      <td className="px-3 py-2 text-foreground font-medium">{line.product_name}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{line.quantity}</td>
                      <td className="px-3 py-2 text-right text-green-400">{received}</td>
                      <td className="px-3 py-2 text-right text-amber-400">{remaining}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min="0"
                          max={line.quantity}
                          value={qtys[line.id] !== undefined ? qtys[line.id] : remaining}
                          onChange={e => setQtys(q => ({ ...q, [line.id]: Number(e.target.value) }))}
                          className="h-7 text-[12px] w-20 ml-auto"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleConfirm} disabled={saving} className="h-8 text-[12px] gap-1.5">
              <PackagePlus className="w-3.5 h-3.5" />
              {saving ? '保存中...' : '确认入库'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}