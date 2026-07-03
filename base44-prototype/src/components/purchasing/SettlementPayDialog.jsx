import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import moment from 'moment';

export default function SettlementPayDialog({ open, onClose, pos, currentUser, payments, onPaid }) {
  const getPaidForPO = (poNumber) =>
    (payments || []).filter(p => p.po_refs?.includes(poNumber)).reduce((s, p) => s + (p.amount_paid || 0), 0);

  const totalOutstanding = pos.reduce((s, po) => {
    const paid = getPaidForPO(po.po_number);
    return s + Math.max(0, (po.total_amount || 0) - paid);
  }, 0);

  const [form, setForm] = useState({
    amount_paid: String(totalOutstanding),
    payment_method: '银行转账',
    payment_date: moment().format('YYYY-MM-DD'),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    const poRefs = pos.map(p => p.po_number);
    const poRefIds = pos.map(p => p.id);
    const supplier = pos[0]?.supplier_name;
    await base44.entities.PaymentRecord.create({
      supplier_name: supplier,
      po_refs: poRefs,
      po_ref_ids: poRefIds,
      amount_paid: Number(form.amount_paid),
      payment_method: form.payment_method,
      payment_date: form.payment_date,
      payment_datetime: new Date().toISOString(),
      notes: form.notes,
      created_by_id: currentUser?.id,
      created_by_name: currentUser?.full_name,
    });
    for (const po of pos) {
      const prevPaid = getPaidForPO(po.po_number);
      const myShare = pos.length === 1 ? Number(form.amount_paid) : Number(form.amount_paid) / pos.length;
      const totalPaid = prevPaid + myShare;
      const newStatus = totalPaid >= (po.total_amount || 0) ? '已结算' : totalPaid > 0 ? '部分结算' : '未结算';
      await base44.entities.PurchaseOrder.update(po.id, { payment_status: newStatus });
    }
    setSaving(false);
    onPaid?.();
  };

  const title = pos.length === 1
    ? `记录付款 — ${pos[0].po_number}`
    : `批量结算 (${pos.length} 项)`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4">
          {pos.length > 1 && (
            <div className="text-[12px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              {pos.map(p => p.po_number).join('、')}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">付款金额 (¥)</Label>
            <Input type="number" value={form.amount_paid} onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))} className="h-9 text-[13px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">付款方式</Label>
            <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['银行转账', '支付宝', '现金', '其他'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">付款日期</Label>
            <Input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} className="h-9 text-[13px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">备注</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-[13px]" placeholder="可选" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleConfirm} disabled={saving || !form.amount_paid} className="h-8 text-[12px]">
              {saving ? '保存中...' : '确认付款'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}