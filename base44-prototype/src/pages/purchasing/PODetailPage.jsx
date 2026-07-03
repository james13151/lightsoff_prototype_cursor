import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowLeft, Plus, Trash2, Archive, PackagePlus, CreditCard } from 'lucide-react';
import { isAdmin, isSupplier, isStaff } from '@/lib/permissions';
import { toast } from 'sonner';
import moment from 'moment';
import POInboundDialog from '@/components/purchasing/POInboundDialog';
import SettlementPayDialog from '@/components/purchasing/SettlementPayDialog';

const STATUS_COLORS = {
  '草稿': 'text-muted-foreground bg-muted/30',
  '待供应商确认': 'text-amber-400 bg-amber-400/10',
  '生产中': 'text-blue-400 bg-blue-400/10',
  '已发货': 'text-purple-400 bg-purple-400/10',
  '已收货': 'text-green-400 bg-green-400/10',
  '已取消': 'text-muted-foreground bg-muted/20',
};

const RECEIPT_STATUS_COLORS = {
  '未收货': 'text-muted-foreground bg-muted/30',
  '部分收货': 'text-amber-400 bg-amber-400/10',
  '收货完成': 'text-green-400 bg-green-400/10',
  '关闭': 'text-muted-foreground bg-muted/20',
};

const PAYMENT_COLORS = {
  '未结算': 'text-red-400 bg-red-400/10',
  '部分结算': 'text-amber-400 bg-amber-400/10',
  '已结算': 'text-green-400 bg-green-400/10',
};

const STATUSES = ['草稿', '待供应商确认', '生产中', '已发货', '已收货', '已取消'];
const SUPPLIER_EDITABLE_STATUSES = ['待供应商确认', '生产中', '已发货'];

export default function PODetailPage({ poId, currentUser, onBack, onNavigateToPO }) {
  const queryClient = useQueryClient();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showInboundDialog, setShowInboundDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [closeReceiptConfirm, setCloseReceiptConfirm] = useState(false);

  const { data: po } = useQuery({
    queryKey: ['po', poId],
    queryFn: async () => { const r = await base44.entities.PurchaseOrder.filter({ id: poId }); return r[0]; },
    enabled: !!poId,
  });

  const { data: lines = [] } = useQuery({
    queryKey: ['po_lines', poId],
    queryFn: () => base44.entities.PurchaseOrderLine.filter({ po_ref: poId }, 'created_date', 100),
    enabled: !!poId,
  });

  const { data: inboundRecords = [] } = useQuery({
    queryKey: ['inbound_by_po', poId],
    queryFn: () => base44.entities.InboundRecord.filter({ po_ref_id: poId }),
    enabled: !!poId,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payment_records'],
    queryFn: () => base44.entities.PaymentRecord.list('-payment_date', 500),
  });

  const isCancelled = po?.production_status === '已取消';
  const canEdit = !isCancelled && (isAdmin(currentUser) || isStaff(currentUser));
  const supplierMode = isSupplier(currentUser);
  const supplierCanEdit = supplierMode && SUPPLIER_EDITABLE_STATUSES.includes(po?.production_status);

  // Compute received per line
  const receivedPerLine = {};
  inboundRecords.forEach(r => {
    if (r.po_line_ref) receivedPerLine[r.po_line_ref] = (receivedPerLine[r.po_line_ref] || 0) + r.quantity;
  });
  const totalOrdered = lines.reduce((s, l) => s + (l.quantity || 0), 0);
  const totalReceived = inboundRecords.reduce((s, r) => s + (r.quantity || 0), 0);
  const totalRemaining = Math.max(0, totalOrdered - totalReceived);

  // Payments for this PO
  const poPayments = payments.filter(p => p.po_refs?.includes(po?.po_number));
  const totalPaid = poPayments.reduce((s, p) => s + (p.amount_paid || 0), 0);
  const outstanding = Math.max(0, (po?.total_amount || 0) - totalPaid);

  const updatePO = async (data) => {
    await base44.entities.PurchaseOrder.update(poId, data);
    queryClient.invalidateQueries({ queryKey: ['po', poId] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
  };

  const handleStatusChange = async (newStatus) => {
    await updatePO({ production_status: newStatus });
  };

  const handleCloseReceipt = async () => {
    await updatePO({ receipt_status: '关闭' });
    setCloseReceiptConfirm(false);
    toast.success('收货状态已关闭');
  };

  const handleCancelPO = async () => {
    await updatePO({ production_status: '已取消', is_archived: true, archive_reason: '已取消' });
    setShowCancelDialog(false);
    toast.success('采购单已取消并归档');
    onBack();
  };

  const handleArchivePO = async () => {
    await updatePO({ is_archived: true, archive_reason: '手动归档' });
    setShowArchiveDialog(false);
    toast.success('采购单已归档');
    onBack();
  };

  const addLine = async () => {
    await base44.entities.PurchaseOrderLine.create({ po_ref: poId, po_number: po?.po_number, product_name: '新产品', quantity: 1, unit_price_cny: 0, line_total: 0 });
    queryClient.invalidateQueries({ queryKey: ['po_lines', poId] });
  };

  const deleteLine = async (lineId) => {
    await base44.entities.PurchaseOrderLine.delete(lineId);
    queryClient.invalidateQueries({ queryKey: ['po_lines', poId] });
    const remaining = lines.filter(l => l.id !== lineId);
    const total = remaining.reduce((s, l) => s + (l.line_total || 0), 0);
    await updatePO({ total_amount: total });
  };

  const updateLine = async (lineId, key, val) => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return;
    const updated = { ...line, [key]: val };
    if (key === 'quantity' || key === 'unit_price_cny') {
      updated.line_total = Number(updated.quantity || 0) * Number(updated.unit_price_cny || 0);
    }
    await base44.entities.PurchaseOrderLine.update(lineId, updated);
    queryClient.invalidateQueries({ queryKey: ['po_lines', poId] });
    const total = lines.map(l => l.id === lineId ? updated.line_total : l.line_total || 0).reduce((s, v) => s + v, 0);
    await updatePO({ total_amount: total });
  };

  if (!po) return <div className="flex-1 flex items-center justify-center text-muted-foreground text-[13px]">加载中...</div>;

  const receiptStatus = po.receipt_status || '未收货';

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 gap-1.5 text-muted-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> 返回
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[18px] font-semibold text-foreground font-mono">{po.po_number}</h1>
              <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${STATUS_COLORS[po.production_status] || ''}`}>{po.production_status}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${RECEIPT_STATUS_COLORS[receiptStatus] || ''}`}>收货：{receiptStatus}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${PAYMENT_COLORS[po.payment_status] || ''}`}>{po.payment_status || '未结算'}</span>
            </div>
            <div className="flex gap-3 mt-1 text-[12px] text-muted-foreground flex-wrap">
              <span>供应商：{po.supplier_name}</span>
              {po.receiving_warehouse && <span>收货仓：{po.receiving_warehouse}</span>}
              <span>创建人：{po.operator_name}</span>
              <span>{moment(po.created_date).format('YYYY-MM-DD')}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {!supplierMode && canEdit && (
            <Button size="sm" className="h-7 text-[12px] gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => setShowInboundDialog(true)}>
              <PackagePlus className="w-3.5 h-3.5" /> 入库
            </Button>
          )}
          {!supplierMode && po.payment_status !== '已结算' && (
            <Button size="sm" variant="outline" className="h-7 text-[12px] gap-1.5" onClick={() => setShowPayDialog(true)}>
              <CreditCard className="w-3.5 h-3.5" /> 记录付款
            </Button>
          )}
          {receiptStatus === '部分收货' && canEdit && (
            <Button variant="outline" size="sm" className="h-7 text-[12px] text-muted-foreground" onClick={() => setCloseReceiptConfirm(true)}>
              关闭收货
            </Button>
          )}
          {!po.is_archived && (isAdmin(currentUser) || isStaff(currentUser)) && (
            <Button variant="outline" size="sm" className="h-7 text-[12px] text-muted-foreground border-border/60 hover:bg-muted/30 gap-1" onClick={() => setShowArchiveDialog(true)}>
              <Archive className="w-3 h-3" /> 归档
            </Button>
          )}
          {!isCancelled && !po.is_archived && (isAdmin(currentUser) || isStaff(currentUser)) && (
            <Button variant="outline" size="sm" className="h-7 text-[12px] text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setShowCancelDialog(true)}>
              取消采购单
            </Button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {!isCancelled && !supplierMode && (
        <div className="mb-6 p-4 rounded-xl border border-thin border-border bg-card/50">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] text-muted-foreground">生产状态：</span>
            <Select value={po.production_status} onValueChange={handleStatusChange} disabled={isCancelled}>
              <SelectTrigger className="h-8 text-[12px] w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.filter(s => s !== '已取消').map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[12px] text-muted-foreground ml-4">收货仓库：</span>
            <Select value={po.receiving_warehouse || ''} onValueChange={v => updatePO({ receiving_warehouse: v })} disabled={!canEdit}>
              <SelectTrigger className="h-8 text-[12px] w-32"><SelectValue placeholder="选择仓库" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="上海仓">上海仓</SelectItem>
                <SelectItem value="Tucson仓">Tucson仓</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4 mt-3 text-[12px]">
            <div>
              <span className="text-muted-foreground">预计发货：</span>
              {canEdit ? (
                <Input type="date" value={po.expected_ship_date || ''} onChange={e => updatePO({ expected_ship_date: e.target.value })} className="h-7 text-[12px] w-36 inline-block ml-1" />
              ) : (
                <span className="text-foreground">{po.expected_ship_date || '-'}</span>
              )}
            </div>
            {po.actual_arrival_date && (
              <div>
                <span className="text-muted-foreground">实际到货：</span>
                <span className="text-foreground ml-1">{po.actual_arrival_date}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vehicle model / notes */}
      {(po.vehicle_model || po.other_notes) && (
        <div className="mb-4 text-[13px] text-muted-foreground">
          {po.vehicle_model && <span>车型：{po.vehicle_model}　</span>}
          {po.other_notes && <span>{po.other_notes}</span>}
        </div>
      )}

      {/* Line items */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[14px] font-semibold text-foreground">产品明细</h2>
          {canEdit && !supplierMode && (
            <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={addLine}>
              <Plus className="w-3 h-3" /> 添加行
            </Button>
          )}
        </div>
        <div className="rounded-xl border border-thin border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-thin border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">产品名称</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">刺绣/备注</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-16">订购</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-16">已收</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-16">待收</th>
                {!supplierMode && <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-20">单价(¥)</th>}
                {!supplierMode && <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground w-20">小计</th>}
                {canEdit && !supplierMode && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map(line => {
                const received = receivedPerLine[line.id] || 0;
                const remaining = Math.max(0, (line.quantity || 0) - received);
                return (
                  <tr key={line.id} className="border-b border-thin border-border">
                    <td className="px-2 py-1.5">
                      {canEdit && !supplierMode ? (
                        <Input defaultValue={line.product_name} onBlur={e => updateLine(line.id, 'product_name', e.target.value)} className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0 px-2" />
                      ) : (
                        <span className="px-4 text-foreground">{line.product_name}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {canEdit && !supplierMode ? (
                        <Input defaultValue={line.embroidery_note} onBlur={e => updateLine(line.id, 'embroidery_note', e.target.value)} className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0 px-2" />
                      ) : (
                        <span className="px-4 text-muted-foreground">{line.embroidery_note || '-'}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {canEdit && !supplierMode ? (
                        <Input type="number" min="1" defaultValue={line.quantity} onBlur={e => updateLine(line.id, 'quantity', Number(e.target.value))} className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0 px-2 w-16 ml-auto" />
                      ) : (
                        <span className="px-2">{line.quantity}</span>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-right text-green-400 font-medium">{received}</td>
                    <td className={`px-4 py-1.5 text-right font-medium ${remaining > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}>{remaining}</td>
                    {!supplierMode && (
                      <td className="px-2 py-1.5 text-right">
                        {canEdit ? (
                          <Input type="number" min="0" defaultValue={line.unit_price_cny} onBlur={e => updateLine(line.id, 'unit_price_cny', Number(e.target.value))} className="h-7 text-[12px] border-0 bg-transparent focus-visible:ring-0 px-2 w-20 ml-auto" />
                        ) : (
                          <span className="px-2">¥{line.unit_price_cny}</span>
                        )}
                      </td>
                    )}
                    {!supplierMode && <td className="px-4 py-1.5 text-right font-semibold text-foreground">¥{(line.line_total || 0).toLocaleString()}</td>}
                    {canEdit && !supplierMode && (
                      <td className="px-1 py-1.5">
                        <button onClick={() => deleteLine(line.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!supplierMode && (
                <tr className="bg-muted/10">
                  <td colSpan={4} className="px-4 py-2.5 text-right text-[12px] font-semibold text-muted-foreground">合计</td>
                  <td className="px-4 py-2.5 text-right text-amber-400 font-semibold">{totalRemaining}</td>
                  <td className="px-4 py-2.5 text-right text-[12px] font-semibold text-muted-foreground">总金额</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-foreground text-[14px]">¥{(po.total_amount || 0).toLocaleString()}</td>
                  {canEdit && <td></td>}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inbound history */}
      {!supplierMode && inboundRecords.length > 0 && (
        <div className="mb-6">
          <h2 className="text-[14px] font-semibold text-foreground mb-2">入库记录</h2>
          <div className="rounded-xl border border-thin border-border overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-thin border-border bg-muted/30">
                  {['日期', '产品', '数量', '仓库', '操作人'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-[11px] font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inboundRecords.map(r => (
                  <tr key={r.id} className="border-b border-thin border-border last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{r.date}</td>
                    <td className="px-4 py-2 text-foreground">{r.sku_name}</td>
                    <td className="px-4 py-2 text-green-400 font-semibold">+{r.quantity}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.warehouse || '-'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.operator_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment history */}
      {!supplierMode && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[14px] font-semibold text-foreground">付款记录</h2>
            <div className="text-[12px] text-muted-foreground">
              已付 <span className="text-green-400 font-semibold">¥{totalPaid.toLocaleString()}</span>
              {outstanding > 0 && <> · 待付 <span className="text-red-400 font-semibold">¥{outstanding.toLocaleString()}</span></>}
            </div>
          </div>
          {poPayments.length > 0 ? (
            <div className="rounded-xl border border-thin border-border overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-thin border-border bg-muted/30">
                    {['付款时间', '金额', '方式', '备注', '记录人'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-[11px] font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poPayments.map(p => (
                    <tr key={p.id} className="border-b border-thin border-border last:border-0">
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {p.payment_datetime ? moment(p.payment_datetime).format('YYYY-MM-DD HH:mm') : p.payment_date}
                      </td>
                      <td className="px-4 py-2 text-green-400 font-semibold">¥{(p.amount_paid || 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.payment_method}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.notes || '-'}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.created_by_name || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground py-2">暂无付款记录</p>
          )}
        </div>
      )}

      {/* Dialogs */}
      <POInboundDialog
        open={showInboundDialog}
        onClose={() => setShowInboundDialog(false)}
        po={po}
        lines={lines}
        currentUser={currentUser}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['inbound_by_po', poId] });
          queryClient.invalidateQueries({ queryKey: ['po', poId] });
          queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
        }}
      />

      {showPayDialog && (
        <SettlementPayDialog
          open={showPayDialog}
          onClose={() => setShowPayDialog(false)}
          pos={[po]}
          currentUser={currentUser}
          payments={payments}
          onPaid={() => {
            queryClient.invalidateQueries({ queryKey: ['payment_records'] });
            queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
            queryClient.invalidateQueries({ queryKey: ['po', poId] });
            setShowPayDialog(false);
          }}
        />
      )}

      <AlertDialog open={closeReceiptConfirm} onOpenChange={setCloseReceiptConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>关闭收货</AlertDialogTitle>
            <AlertDialogDescription>仍有 {totalRemaining} 件未收货，确认关闭收货状态？关闭后不再计入待收数量。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseReceipt}>确认关闭</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消采购单</AlertDialogTitle>
            <AlertDialogDescription>确认取消 {po.po_number}？取消后不可编辑。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>返回</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelPO} className="bg-destructive hover:bg-destructive/90">确认取消</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>归档采购单 {po.po_number}？</AlertDialogTitle>
            <AlertDialogDescription>归档后此采购单将从活跃列表移出，可在「已归档采购单」中查看和恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchivePO}>确认归档</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}