import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import { toastSuccess } from '@/lib/toast';

const EMPTY_LINE = { sku_ref: '', product_name: '', embroidery_note: '', quantity: 1, unit_price_cny: 0, line_total: 0 };

export default function CreatePODialog({ open, onClose, currentUser, prefillProduct, linkedTicketId, linkedTicketTitle, onCreated }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ supplier_name: '', vehicle_model: '', other_notes: '', expected_ship_date: '', production_status: '待供应商确认', receiving_warehouse: '上海仓' });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
    enabled: open,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm({ supplier_name: '', vehicle_model: '', other_notes: linkedTicketTitle ? `关联工单: ${linkedTicketTitle}` : '', expected_ship_date: '', production_status: '待供应商确认', receiving_warehouse: '上海仓' });
    if (prefillProduct) {
      setLines([{ ...EMPTY_LINE, product_name: prefillProduct.name, quantity: Math.max(1, (prefillProduct.safety_stock || 0) - (prefillProduct.current_stock || 0)) }]);
    } else {
      setLines([{ ...EMPTY_LINE }]);
    }
  }, [open, prefillProduct, linkedTicketTitle]);

  const updateLine = (idx, key, val) => {
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [key]: val };
      // When product is selected, auto-fill name and price
      if (key === 'sku_ref') {
        const product = products.find(p => p.id === val);
        if (product) {
          updated.product_name = product.name;
          updated.unit_price_cny = product.last_po_price || 0;
          updated.line_total = Number(updated.quantity || 1) * (product.last_po_price || 0);
        }
      }
      if (key === 'quantity' || key === 'unit_price_cny') {
        updated.line_total = Number(updated.quantity || 0) * Number(updated.unit_price_cny || 0);
      }
      return updated;
    }));
  };

  const totalAmount = lines.reduce((s, l) => s + (l.line_total || 0), 0);

  const generatePONumber = async () => {
    const year = moment().year();
    const existing = await base44.entities.PurchaseOrder.list('-created_date', 1);
    const last = existing[0]?.po_number;
    let seq = 1;
    if (last) {
      const m = last.match(/PO-\d{4}-(\d+)/);
      if (m) seq = parseInt(m[1]) + 1;
    }
    return `PO-${year}-${String(seq).padStart(3, '0')}`;
  };

  const handleSave = async () => {
    if (!form.supplier_name) return;
    setSaving(true);
    const poNumber = await generatePONumber();
    const po = await base44.entities.PurchaseOrder.create({
      ...form,
      po_number: poNumber,
      operator_id: currentUser?.id,
      operator_name: currentUser?.full_name,
      total_amount: totalAmount,
      linked_ticket: linkedTicketId || '',
      payment_status: '未结算',
    });
    for (const line of lines) {
      if (!line.product_name.trim()) continue;
      await base44.entities.PurchaseOrderLine.create({
        po_ref: po.id,
        po_number: poNumber,
        ...line,
        line_total: Number(line.quantity || 0) * Number(line.unit_price_cny || 0),
      });
    }
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    setSaving(false);
    toastSuccess('采购单已创建');
    onCreated?.(po.id, poNumber);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-thin border-border">
          <DialogTitle className="text-[15px] font-semibold">新建采购单</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 pt-4 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {linkedTicketId && (
            <div className="text-[12px] bg-primary/10 text-primary px-3 py-2 rounded-lg">关联工单已绑定</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">供应商 *</Label>
              {suppliers.length === 0 ? (
                <div className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
                  请先在供应商管理中添加供应商
                </div>
              ) : (
                <Select value={form.supplier_name} onValueChange={v => setForm(f => ({ ...f, supplier_name: v }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择供应商" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">车型</Label>
              <Input value={form.vehicle_model} onChange={e => setForm(f => ({ ...f, vehicle_model: e.target.value }))} placeholder="车型" className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">初始状态</Label>
              <Select value={form.production_status} onValueChange={v => setForm(f => ({ ...f, production_status: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['草稿','待供应商确认','生产中','已发货','已收货'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">收货仓库</Label>
              <Select value={form.receiving_warehouse} onValueChange={v => setForm(f => ({ ...f, receiving_warehouse: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="上海仓">上海仓</SelectItem>
                  <SelectItem value="Tucson仓">Tucson仓</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">预计发货日期</Label>
              <Input type="date" value={form.expected_ship_date} onChange={e => setForm(f => ({ ...f, expected_ship_date: e.target.value }))} className="h-9 text-[13px]" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">备注</Label>
            <Input value={form.other_notes} onChange={e => setForm(f => ({ ...f, other_notes: e.target.value }))} placeholder="备注" className="h-9 text-[13px]" />
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] font-medium text-muted-foreground">产品明细</Label>
              <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>
                <Plus className="w-3 h-3" /> 添加行
              </Button>
            </div>
            <div className="rounded-lg border border-thin border-border overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-thin border-border bg-muted/20">
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">产品</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium">刺绣/备注</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium w-20">数量</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium w-24">单价(¥)</th>
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium w-24">小计</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-thin border-border">
                      <td className="px-2 py-1.5 min-w-[180px]">
                        <Select value={line.sku_ref} onValueChange={v => updateLine(idx, 'sku_ref', v)}>
                          <SelectTrigger className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0">
                            <SelectValue placeholder="选择产品" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.sku_id ? `[${p.sku_id}] ` : ''}{p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={line.embroidery_note} onChange={e => updateLine(idx, 'embroidery_note', e.target.value)} placeholder="刺绣/备注" className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0 px-1 w-28" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min="1" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0 px-1 w-16" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min="0" value={line.unit_price_cny} onChange={e => updateLine(idx, 'unit_price_cny', e.target.value)} className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0 px-1 w-20" />
                      </td>
                      <td className="px-3 py-1.5 font-medium text-foreground">¥{(line.line_total || 0).toLocaleString()}</td>
                      <td className="px-1 py-1.5">
                        {lines.length > 1 && (
                          <button onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2 text-[13px] font-semibold text-foreground">
              合计：¥{totalAmount.toLocaleString()}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleSave} disabled={saving || !form.supplier_name} className="h-8 text-[12px]">
              {saving ? '创建中...' : '创建采购单'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}