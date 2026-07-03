import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Plus, Trash2 } from 'lucide-react';
import { isAdmin, isSupplier, isStaff } from '@/lib/permissions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ArrivalConfirmDialog from './ArrivalConfirmDialog';
import moment from 'moment';

const STATUS_LIST = ['草稿', '待供应商确认', '生产中', '已发货', '已收货', '已取消'];

const STATUS_COLORS = {
  '草稿': 'text-muted-foreground bg-muted/50',
  '待供应商确认': 'text-amber-400 bg-amber-400/10',
  '生产中': 'text-blue-400 bg-blue-400/10',
  '已发货': 'text-purple-400 bg-purple-400/10',
  '已收货': 'text-green-400 bg-green-400/10',
  '已取消': 'text-destructive bg-destructive/10',
};

export default function PODetailPanel({ po, currentUser, onClose, onRefresh }) {
  const queryClient = useQueryClient();
  const [showArrival, setShowArrival] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const userIsAdmin = isAdmin(currentUser);
  const userIsSupplier = isSupplier(currentUser);
  const userIsStaff = isStaff(currentUser);
  const isCancelled = po.production_status === '已取消';

  const { data: lines = [] } = useQuery({
    queryKey: ['po_lines', po.id],
    queryFn: () => base44.entities.PurchaseOrderLine.filter({ po_ref: po.id }),
  });

  const [editingLines, setEditingLines] = useState(false);
  const [localLines, setLocalLines] = useState([]);

  const startEditLines = () => {
    setLocalLines(lines.map(l => ({ ...l })));
    setEditingLines(true);
  };

  const saveLines = async () => {
    for (const line of localLines) {
      const lineTotal = Number(line.quantity) * Number(line.unit_price_cny);
      if (line.id) {
        await base44.entities.PurchaseOrderLine.update(line.id, { ...line, line_total: lineTotal });
      } else {
        await base44.entities.PurchaseOrderLine.create({ ...line, po_ref: po.id, po_number: po.po_number, line_total: lineTotal });
      }
    }
    const totalAmount = localLines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price_cny), 0);
    await base44.entities.PurchaseOrder.update(po.id, { total_amount: totalAmount });
    queryClient.invalidateQueries({ queryKey: ['po_lines', po.id] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    onRefresh();
    setEditingLines(false);
  };

  const handleStatusChange = async (newStatus) => {
    if (newStatus === '已收货') {
      setShowArrival(true);
      return;
    }
    await base44.entities.PurchaseOrder.update(po.id, { production_status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    onRefresh();
  };

  const handleCancel = async () => {
    await base44.entities.PurchaseOrder.update(po.id, { production_status: '已取消' });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    onRefresh();
    setShowCancel(false);
  };

  // Supplier editable fields
  const [supplierEdit, setSupplierEdit] = useState(null);
  const startSupplierEdit = () => setSupplierEdit({
    production_status: po.production_status,
    expected_ship_date: po.expected_ship_date || '',
    other_notes: po.other_notes || '',
  });
  const saveSupplierEdit = async () => {
    await base44.entities.PurchaseOrder.update(po.id, supplierEdit);
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    onRefresh();
    setSupplierEdit(null);
  };

  const updateLocalLine = (idx, field, value) => {
    setLocalLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  return (
    <div className="w-[420px] min-w-[420px] border-l border-thin border-border flex flex-col h-full bg-background overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="px-5 py-4 border-b border-thin border-border flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[13px] text-primary">{po.po_number}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${STATUS_COLORS[po.production_status]}`}>{po.production_status}</span>
          </div>
          <div className="text-[12px] text-muted-foreground">{po.supplier_name} · {moment(po.created_date).format('YYYY-MM-DD')}</div>
          {po.linked_ticket && (
            <div className="text-[11px] text-muted-foreground mt-1">关联工单: <span className="text-primary">{po.linked_ticket}</span></div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7"><X className="w-4 h-4" /></Button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-5">
        {/* Status change for non-supplier */}
        {!userIsSupplier && !isCancelled && (
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">更改状态</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_LIST.filter(s => s !== '已取消').map(s => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${po.production_status === s ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Supplier edit */}
        {userIsSupplier && !isCancelled && (
          <div>
            {supplierEdit ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">生产状态</p>
                  <Select value={supplierEdit.production_status} onValueChange={v => setSupplierEdit(e => ({ ...e, production_status: v }))}>
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['生产中', '已发货'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">预计发货日期</p>
                  <Input type="date" value={supplierEdit.expected_ship_date} onChange={e => setSupplierEdit(s => ({ ...s, expected_ship_date: e.target.value }))} className="h-8 text-[12px]" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">备注</p>
                  <Input value={supplierEdit.other_notes} onChange={e => setSupplierEdit(s => ({ ...s, other_notes: e.target.value }))} className="h-8 text-[12px]" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-[11px]" onClick={saveSupplierEdit}>保存</Button>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setSupplierEdit(null)}>取消</Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={startSupplierEdit}>编辑状态/发货日期</Button>
            )}
          </div>
        )}

        {/* Line items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-foreground">明细</p>
            {!userIsSupplier && !isCancelled && (
              editingLines
                ? <div className="flex gap-1.5">
                    <Button size="sm" className="h-6 text-[11px] px-2" onClick={saveLines}>保存</Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setEditingLines(false)}>取消</Button>
                  </div>
                : <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={startEditLines}>编辑</Button>
            )}
          </div>

          {editingLines ? (
            <div className="space-y-2">
              {localLines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input value={line.product_name} onChange={e => updateLocalLine(idx, 'product_name', e.target.value)} placeholder="产品名称" className="h-7 text-[12px] flex-1" />
                  <Input type="number" value={line.quantity} onChange={e => updateLocalLine(idx, 'quantity', e.target.value)} className="h-7 text-[12px] w-14" />
                  <Input type="number" value={line.unit_price_cny} onChange={e => updateLocalLine(idx, 'unit_price_cny', e.target.value)} placeholder="单价" className="h-7 text-[12px] w-16" />
                  <span className="text-[11px] text-muted-foreground w-14">¥{(Number(line.quantity) * Number(line.unit_price_cny)).toFixed(0)}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setLocalLines(l => l.filter((_, i) => i !== idx))}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => setLocalLines(l => [...l, { product_name: '', embroidery_note: '', quantity: 1, unit_price_cny: 0 }])}>
                <Plus className="w-3 h-3" /> 添加行
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-thin border-border overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-thin border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-[11px] text-muted-foreground">产品</th>
                    <th className="px-3 py-2 text-left text-[11px] text-muted-foreground">绣花</th>
                    <th className="px-3 py-2 text-right text-[11px] text-muted-foreground">数量</th>
                    {!userIsSupplier && <th className="px-3 py-2 text-right text-[11px] text-muted-foreground">单价</th>}
                    {!userIsSupplier && <th className="px-3 py-2 text-right text-[11px] text-muted-foreground">小计</th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.id} className="border-b border-thin border-border last:border-0">
                      <td className="px-3 py-2 text-foreground font-medium">{l.product_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.embroidery_note || '-'}</td>
                      <td className="px-3 py-2 text-right">{l.quantity}</td>
                      {!userIsSupplier && <td className="px-3 py-2 text-right">¥{l.unit_price_cny}</td>}
                      {!userIsSupplier && <td className="px-3 py-2 text-right font-medium">¥{(l.line_total || 0).toFixed(0)}</td>}
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">暂无明细</td></tr>}
                </tbody>
                {!userIsSupplier && lines.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-thin border-border bg-muted/20">
                      <td colSpan={4} className="px-3 py-2 text-right text-[12px] font-medium text-muted-foreground">合计</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">¥{(po.total_amount || 0).toFixed(0)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <p className="text-muted-foreground mb-0.5">预计发货</p>
            <p className="text-foreground">{po.expected_ship_date ? moment(po.expected_ship_date).format('YYYY-MM-DD') : '-'}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">实际到货</p>
            <p className="text-foreground">{po.actual_arrival_date ? moment(po.actual_arrival_date).format('YYYY-MM-DD') : '-'}</p>
          </div>
          {!userIsSupplier && (
            <>
              <div>
                <p className="text-muted-foreground mb-0.5">创建人</p>
                <p className="text-foreground">{po.operator_name || '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">结算状态</p>
                <p className="text-foreground">{po.payment_status}</p>
              </div>
            </>
          )}
          {po.other_notes && (
            <div className="col-span-2">
              <p className="text-muted-foreground mb-0.5">备注</p>
              <p className="text-foreground">{po.other_notes}</p>
            </div>
          )}
        </div>

        {/* Cancel button (admin only) */}
        {userIsAdmin && !isCancelled && (
          <div className="pt-2">
            <Button variant="ghost" size="sm" className="h-7 text-[11px] text-destructive hover:text-destructive" onClick={() => setShowCancel(true)}>
              取消采购单
            </Button>
          </div>
        )}
      </div>

      <ArrivalConfirmDialog
        open={showArrival}
        onClose={() => setShowArrival(false)}
        po={po}
        lines={lines}
        currentUser={currentUser}
        onConfirmed={() => {
          queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['inbound_records'] });
          onRefresh();
        }}
      />

      <AlertDialog open={showCancel} onOpenChange={setShowCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消采购单</AlertDialogTitle>
            <AlertDialogDescription>取消后将无法再编辑此采购单，确定要取消 {po.po_number} 吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive hover:bg-destructive/90">确认取消</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}