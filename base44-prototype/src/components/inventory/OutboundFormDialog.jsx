import React, { useState, useEffect } from 'react';
import { toastSuccess } from '@/lib/toast';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@/lib/settingsContext';
import { syncStockForProduct } from '@/lib/stockUtils';
import { isPartner } from '@/lib/permissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import moment from 'moment';

const WAREHOUSES = ['上海仓', 'Tucson仓'];

export default function OutboundFormDialog({ open, onClose, currentUser, onSaved }) {
  const { settings } = useSettings();
  const partnerLocked = isPartner(currentUser);
  const defaultWarehouse = partnerLocked ? 'Tucson仓' : '上海仓';

  const [form, setForm] = useState({
    date: moment().format('YYYY-MM-DD'),
    sku_ref: '',
    warehouse: defaultWarehouse,
    quantity: 1,
    type: '销售出库',
    order_number: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [pendingData, setPendingData] = useState(null);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    enabled: open,
  });



  useEffect(() => {
    if (open) setForm({
      date: moment().format('YYYY-MM-DD'),
      sku_ref: '',
      warehouse: defaultWarehouse,
      quantity: 1,
      type: '销售出库',
      order_number: '',
      notes: '',
    });
  }, [open, defaultWarehouse]);

  const doSave = async (addBack) => {
    const { form: f, product } = pendingData;
    await base44.entities.OutboundRecord.create({
      ...f,
      sku_name: product?.name || '',
      operator_id: currentUser?.id,
      operator_name: currentUser?.full_name,
    });

    // Sync computed InventoryStock
    await syncStockForProduct(f.sku_ref, f.warehouse);

    // Auto-create FeeRecord for Partner outbound
    if (partnerLocked && !addBack) {
      const feeRate = settings?.operation_fee_rate ?? 5;
      await base44.entities.FeeRecord.create({
        outbound_record_ref: 'pending',
        partner_user_ref: currentUser?.id,
        partner_name: currentUser?.full_name,
        sku_name: product?.name || '',
        quantity: Number(f.quantity),
        unit_fee: feeRate,
        total_fee: feeRate * Number(f.quantity),
        date: f.date,
        status: '未结算',
      });
    }

    setSaving(false);
    setShowReturnConfirm(false);
    setPendingData(null);
    toastSuccess('出库记录已保存');
    onSaved();
    onClose();
  };

  const handleSave = async () => {
    if (!form.sku_ref || !form.quantity) return;
    setSaving(true);
    const product = products.find(p => p.id === form.sku_ref);

    if (form.type === '退货出库') {
      setPendingData({ form, product });
      setShowReturnConfirm(true);
      setSaving(false);
      return;
    }

    await base44.entities.OutboundRecord.create({
      ...form,
      sku_name: product?.name || '',
      operator_id: currentUser?.id,
      operator_name: currentUser?.full_name,
    });

    // Sync computed InventoryStock
    await syncStockForProduct(form.sku_ref, form.warehouse);

    // Auto-create FeeRecord for Partner
    if (partnerLocked) {
      const feeRate = settings?.operation_fee_rate ?? 5;
      await base44.entities.FeeRecord.create({
        outbound_record_ref: 'pending',
        partner_user_ref: currentUser?.id,
        partner_name: currentUser?.full_name,
        sku_name: product?.name || '',
        quantity: Number(form.quantity),
        unit_fee: feeRate,
        total_fee: feeRate * Number(form.quantity),
        date: form.date,
        status: '未结算',
      });
    }

    setSaving(false);
    toastSuccess('出库记录已保存');
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
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md p-0 rounded-xl">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="text-[15px] font-semibold">新增出库</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-5 space-y-4">
            <F label="出库日期">
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-[13px]" />
            </F>

            <div className="grid grid-cols-2 gap-4">
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
              <F label="出库类型 *">
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['销售出库', '退货出库', '调拨出库'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            </div>

            <F label="产品 *">
              <Select value={form.sku_ref} onValueChange={v => setForm(f => ({ ...f, sku_ref: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择产品" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku_id ? `[${p.sku_id}] ` : ''}{p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>

            <F label="数量 *">
              <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="h-9 text-[13px]" />
            </F>

            {partnerLocked && (
              <div className="rounded-lg bg-amber-400/10 border border-amber-400/20 px-3 py-2 text-[12px] text-amber-300">
                出库将自动生成操作费记录（¥{settings?.operation_fee_rate ?? 5}/单）
              </div>
            )}

            <F label="订单号">
              <Input value={form.order_number} onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))} placeholder="可选" className="h-9 text-[13px]" />
            </F>
            <F label="备注">
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="可选" className="h-9 text-[13px]" />
            </F>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
              <Button onClick={handleSave} disabled={saving || !form.sku_ref} className="h-8 text-[12px]">
                {saving ? '保存中...' : '确认出库'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showReturnConfirm} onOpenChange={setShowReturnConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退货出库确认</AlertDialogTitle>
            <AlertDialogDescription>是否将此数量加回库存？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => doSave(false)}>不加回</AlertDialogCancel>
            <AlertDialogAction onClick={() => doSave(true)}>加回库存</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}