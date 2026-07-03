import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import moment from 'moment';

export default function WarehouseTransferDialog({ open, onClose, currentUser, onSaved }) {
  const [form, setForm] = useState({ date: moment().format('YYYY-MM-DD'), sku_ref: '', from_location: '', to_location: '', quantity: 1, notes: '' });
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    enabled: open,
  });

  useEffect(() => {
    if (open) setForm({ date: moment().format('YYYY-MM-DD'), sku_ref: '', from_location: '', to_location: '', quantity: 1, notes: '' });
  }, [open]);

  const handleSelectProduct = (id) => {
    const p = products.find(x => x.id === id);
    setForm(f => ({ ...f, sku_ref: id, from_location: p?.warehouse_location || '' }));
  };

  const handleSave = async () => {
    if (!form.sku_ref || !form.to_location) return;
    setSaving(true);
    const product = products.find(p => p.id === form.sku_ref);
    await base44.entities.WarehouseTransfer.create({
      ...form,
      sku_name: product?.name || '',
      operator_id: currentUser?.id,
      operator_name: currentUser?.full_name,
    });
    if (product && form.to_location) {
      await base44.entities.Product.update(product.id, { warehouse_location: form.to_location });
    }
    setSaving(false);
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
          <DialogTitle className="text-[15px] font-semibold">新增仓位调拨</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4">
          <F label="日期">
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-[13px]" />
          </F>
          <F label="产品 *">
            <Select value={form.sku_ref} onValueChange={handleSelectProduct}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择产品" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku_id ? `[${p.sku_id}] ` : ''}{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <div className="grid grid-cols-2 gap-4">
            <F label="来源仓位">
              <Input value={form.from_location} onChange={e => setForm(f => ({ ...f, from_location: e.target.value }))} placeholder="如 A-02" className="h-9 text-[13px]" />
            </F>
            <F label="目标仓位 *">
              <Input value={form.to_location} onChange={e => setForm(f => ({ ...f, to_location: e.target.value }))} placeholder="如 B-05" className="h-9 text-[13px]" />
            </F>
          </div>
          <F label="数量">
            <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="h-9 text-[13px]" />
          </F>
          <F label="备注">
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="可选" className="h-9 text-[13px]" />
          </F>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleSave} disabled={saving || !form.sku_ref || !form.to_location} className="h-8 text-[12px]">
              {saving ? '保存中...' : '确认调拨'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}