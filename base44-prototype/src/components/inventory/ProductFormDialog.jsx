import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EMPTY = { sku_id: '', name: '', category: '', brand_line: '', vehicle_model: '', current_stock: 0, safety_stock: 0, warehouse_location: '', notes: '' };

export default function ProductFormDialog({ open, onClose, product, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(product ? { ...EMPTY, ...product } : EMPTY);
  }, [product, open]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (product) {
      await base44.entities.Product.update(product.id, form);
    } else {
      await base44.entities.Product.create(form);
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
      <DialogContent className="max-w-lg p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-[15px] font-semibold">{product ? '编辑SKU' : '新增SKU'}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <F label="SKU编号">
              <Input value={form.sku_id} onChange={e => setForm(f => ({ ...f, sku_id: e.target.value }))} placeholder="如 MINI-SPL-001" className="h-9 text-[13px]" />
            </F>
            <F label="产品名称 *">
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="产品名称" className="h-9 text-[13px]" />
            </F>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="分类">
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择分类" /></SelectTrigger>
                <SelectContent>
                  {['空气动力', '内饰配件', '转向系统', '脚垫配件', '其他'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="品牌">
              <Select value={form.brand_line} onValueChange={v => setForm(f => ({ ...f, brand_line: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择品牌" /></SelectTrigger>
                <SelectContent>
                  {['MINI', 'VW', 'Volvo', '其他'].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="车型">
              <Input value={form.vehicle_model} onChange={e => setForm(f => ({ ...f, vehicle_model: e.target.value }))} placeholder="车型型号" className="h-9 text-[13px]" />
            </F>
            <F label="仓位">
              <Input value={form.warehouse_location} onChange={e => setForm(f => ({ ...f, warehouse_location: e.target.value }))} placeholder="如 A-02" className="h-9 text-[13px]" />
            </F>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <F label="当前库存">
              <Input type="number" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: Number(e.target.value) }))} className="h-9 text-[13px]" />
            </F>
            <F label="安全库存">
              <Input type="number" value={form.safety_stock} onChange={e => setForm(f => ({ ...f, safety_stock: Number(e.target.value) }))} className="h-9 text-[13px]" />
            </F>
          </div>
          <F label="备注">
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="可选备注" className="h-9 text-[13px]" />
          </F>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="h-8 text-[12px]">
              {saving ? '保存中...' : (product ? '保存修改' : '创建SKU')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}