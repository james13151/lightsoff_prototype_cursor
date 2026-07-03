import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { isPartner } from '@/lib/permissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import moment from 'moment';
import { toastSuccess } from '@/lib/toast';
import { syncStockForProduct } from '@/lib/stockUtils';

const WAREHOUSES = ['上海仓', 'Tucson仓'];

export default function InboundFormDialog({ open, onClose, currentUser, onSaved }) {
  const partnerLocked = isPartner(currentUser);
  const defaultWarehouse = partnerLocked ? 'Tucson仓' : '上海仓';

  const [form, setForm] = useState({
    date: moment().format('YYYY-MM-DD'),
    sku_ref: '',
    warehouse: defaultWarehouse,
    quantity: 1,
    supplier: '',
    purchase_order_number: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
    enabled: open,
  });

  useEffect(() => {
    if (open) setForm({
      date: moment().format('YYYY-MM-DD'),
      sku_ref: '',
      warehouse: defaultWarehouse,
      quantity: 1,
      supplier: '',
      purchase_order_number: '',
      notes: '',
    });
  }, [open, defaultWarehouse]);

  const handleSave = async () => {
    if (!form.sku_ref || !form.quantity) return;
    setSaving(true);
    const product = products.find(p => p.id === form.sku_ref);

    await base44.entities.InboundRecord.create({
      ...form,
      sku_name: product?.name || '',
      operator_id: currentUser?.id,
      operator_name: currentUser?.full_name,
    });

    // Recompute and sync InventoryStock from all records
    await syncStockForProduct(form.sku_ref, form.warehouse);

    setSaving(false);
    toastSuccess('入库记录已保存');
    onSaved();
    onClose();
  };

  const F = ({ label, children }) => (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-[15px] font-semibold">新增入库</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4">
          <F label="入库日期">
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-[13px]" />
          </F>

          <F label="仓库 *">
            {partnerLocked ? (
              <div className="h-9 px-3 flex items-center text-[13px] rounded-md border border-input bg-muted/40 text-muted-foreground">Tucson仓</div>
            ) : (
              <Select value={form.warehouse} onValueChange={v => setForm(f => ({ ...f, warehouse: v, sku_ref: '' }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </F>

          <F label="产品 *">
            <Select value={form.sku_ref} onValueChange={v => setForm(f => ({ ...f, sku_ref: v }))}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择产品" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku_id ? `[${p.sku_id}] ` : ''}{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>

          <div className="grid grid-cols-2 gap-4">
            <F label="数量 *">
              <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="h-9 text-[13px]" />
            </F>
            <F label="供应商">
              <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="供应商名称" className="h-9 text-[13px]" />
            </F>
          </div>
          <F label="采购单号">
            <Input value={form.purchase_order_number} onChange={e => setForm(f => ({ ...f, purchase_order_number: e.target.value }))} placeholder="可选" className="h-9 text-[13px]" />
          </F>
          <F label="备注">
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="可选" className="h-9 text-[13px]" />
          </F>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleSave} disabled={saving || !form.sku_ref} className="h-8 text-[12px]">
              {saving ? '保存中...' : '确认入库'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}