import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import moment from 'moment';
import { toastSuccess } from '@/lib/toast';
import { syncStockForProduct } from '@/lib/stockUtils';

const WAREHOUSES = ['上海仓', 'Tucson仓'];

export default function StockAdjustmentDialog({ open, onClose, currentUser, onSaved }) {
  const [form, setForm] = useState({ date: moment().format('YYYY-MM-DD'), sku_ref: '', warehouse: '上海仓', after_qty: 0, reason: '' });
  const [currentQty, setCurrentQty] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
    enabled: open,
  });

  const { data: stocks = [] } = useQuery({
    queryKey: ['inventory_stocks'],
    queryFn: () => base44.entities.InventoryStock.list(),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm({ date: moment().format('YYYY-MM-DD'), sku_ref: '', warehouse: '上海仓', after_qty: 0, reason: '' });
      setCurrentQty(null);
    }
  }, [open]);

  const loadCurrentQty = (skuRef, warehouse) => {
    const stock = stocks.find(s => s.sku_ref === skuRef && s.warehouse === warehouse);
    const qty = stock?.quantity ?? 0;
    setCurrentQty(qty);
    setForm(f => ({ ...f, after_qty: qty }));
  };

  const handleSelectProduct = (id) => {
    setForm(f => { 
      const w = f.warehouse;
      setTimeout(() => loadCurrentQty(id, w), 0);
      return { ...f, sku_ref: id };
    });
    loadCurrentQty(id, form.warehouse);
  };

  const handleSelectWarehouse = (w) => {
    setForm(f => ({ ...f, warehouse: w }));
    if (form.sku_ref) loadCurrentQty(form.sku_ref, w);
  };

  const handleSave = async () => {
    if (!form.sku_ref || !form.warehouse) return;
    setSaving(true);
    const product = products.find(p => p.id === form.sku_ref);
    const beforeQty = currentQty ?? 0;
    const afterQty = Number(form.after_qty);
    await base44.entities.StockAdjustment.create({
      date: form.date,
      sku_ref: form.sku_ref,
      sku_name: product?.name || '',
      warehouse: form.warehouse,
      before_qty: beforeQty,
      after_qty: afterQty,
      difference: afterQty - beforeQty,
      reason: form.reason,
      operator_id: currentUser?.id,
      operator_name: currentUser?.full_name,
    });
    // Sync computed stock
    await syncStockForProduct(form.sku_ref, form.warehouse);
    setSaving(false);
    toastSuccess('库存已修正');
    onSaved();
    onClose();
  };

  const F = ({ label, children }) => (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );

  const diff = form.sku_ref && currentQty !== null ? Number(form.after_qty) - currentQty : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-[15px] font-semibold">新增库存修正</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4">
          <F label="日期">
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-[13px]" />
          </F>
          <div className="grid grid-cols-2 gap-4">
            <F label="仓库 *">
              <Select value={form.warehouse} onValueChange={handleSelectWarehouse}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAREHOUSES.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="产品 *">
              <Select value={form.sku_ref} onValueChange={handleSelectProduct}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择产品" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.sku_id ? `[${p.sku_id}] ` : ''}{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>
          {currentQty !== null && (
            <div className="flex items-center gap-4 text-[13px]">
              <span className="text-muted-foreground">{form.warehouse} 当前库存：<span className="text-foreground font-medium">{currentQty}</span></span>
              {diff !== null && <span className={`font-medium ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>差异：{diff >= 0 ? '+' : ''}{diff}</span>}
            </div>
          )}
          <F label="修正后数量 *">
            <Input type="number" min="0" value={form.after_qty} onChange={e => setForm(f => ({ ...f, after_qty: e.target.value }))} className="h-9 text-[13px]" />
          </F>
          <F label="修正原因">
            <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="说明修正原因" className="h-9 text-[13px]" />
          </F>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleSave} disabled={saving || !form.sku_ref} className="h-8 text-[12px]">
              {saving ? '保存中...' : '确认修正'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}