import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, RotateCcw, Trash2 } from 'lucide-react';
import { isAdmin } from '@/lib/permissions';
import { toast } from 'sonner';
import moment from 'moment';

const STATUS_COLORS = {
  '草稿': 'text-muted-foreground bg-muted/30',
  '待供应商确认': 'text-amber-400 bg-amber-400/10',
  '生产中': 'text-blue-400 bg-blue-400/10',
  '已发货': 'text-purple-400 bg-purple-400/10',
  '已收货': 'text-green-400 bg-green-400/10',
  '已取消': 'text-muted-foreground bg-muted/20',
};

const PAYMENT_COLORS = {
  '未结算': 'text-red-400 bg-red-400/10',
  '部分结算': 'text-amber-400 bg-amber-400/10',
  '已结算': 'text-green-400 bg-green-400/10',
};

const ARCHIVE_REASON_COLORS = {
  '已结算': 'text-green-600 bg-green-100',
  '已取消': 'text-muted-foreground bg-muted/30',
  '手动归档': 'text-blue-600 bg-blue-100',
};

export default function POArchivePage({ currentUser }) {
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('all');
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirm2, setDeleteConfirm2] = useState(false);
  const queryClient = useQueryClient();

  const { data: archivedPOs = [] } = useQuery({
    queryKey: ['purchase_orders_archived'],
    queryFn: () => base44.entities.PurchaseOrder.filter({ is_archived: true }, '-updated_date', 500),
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    let list = archivedPOs;
    if (search) list = list.filter(po => po.po_number?.includes(search) || po.supplier_name?.includes(search));
    if (filterReason !== 'all') list = list.filter(po => po.archive_reason === filterReason);
    return list;
  }, [archivedPOs, search, filterReason]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    await base44.entities.PurchaseOrder.update(restoreTarget.id, { is_archived: false, archive_reason: null });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders_archived'] });
    toast.success('采购单已恢复 / Purchase order restored');
    setRestoreTarget(null);
  };

  const handleDeleteStep1 = (po) => {
    setDeleteTarget(po);
    setDeleteConfirm2(false);
  };

  const handleDeleteFinal = async () => {
    if (!deleteTarget) return;
    // Also delete associated lines
    const lines = await base44.entities.PurchaseOrderLine.filter({ po_ref: deleteTarget.id }, 'created_date', 200);
    for (const line of lines) {
      await base44.entities.PurchaseOrderLine.delete(line.id);
    }
    await base44.entities.PurchaseOrder.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
    queryClient.invalidateQueries({ queryKey: ['purchase_orders_archived'] });
    toast.success('采购单已永久删除');
    setDeleteTarget(null);
    setDeleteConfirm2(false);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">已归档采购单</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">共 {archivedPOs.length} 条归档记录</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索PO号或供应商" className="h-8 pl-8 text-[12px] w-44" />
        </div>
        <Select value={filterReason} onValueChange={setFilterReason}>
          <SelectTrigger className="h-8 text-[12px] w-36"><SelectValue placeholder="归档原因" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部原因</SelectItem>
            <SelectItem value="已结算">已结算</SelectItem>
            <SelectItem value="已取消">已取消</SelectItem>
            <SelectItem value="手动归档">手动归档</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-thin border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-thin border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">PO号</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">供应商</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">总金额</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">结算状态</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">归档原因</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">归档时间</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(po => (
              <tr key={po.id} className="border-b border-thin border-border opacity-75 hover:opacity-100 transition-opacity">
                <td className="px-4 py-2.5 font-mono text-[12px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {po.po_number || '-'}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-normal">已归档</span>
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{po.supplier_name}</td>
                <td className="px-4 py-2.5 font-semibold text-foreground">¥{(po.total_amount || 0).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${STATUS_COLORS[po.production_status] || ''}`}>{po.production_status}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${PAYMENT_COLORS[po.payment_status] || ''}`}>{po.payment_status || '未结算'}</span>
                </td>
                <td className="px-4 py-2.5">
                  {po.archive_reason && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${ARCHIVE_REASON_COLORS[po.archive_reason] || ''}`}>{po.archive_reason}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-[12px]">
                  {po.updated_date ? moment(po.updated_date).format('MM-DD HH:mm') : '-'}
                </td>
                <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin(currentUser) && (
                      <>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => setRestoreTarget(po)}>
                          <RotateCcw className="w-3 h-3" /> 恢复
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteStep1(po)}>
                          <Trash2 className="w-3 h-3" /> 删除
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-[13px]">暂无归档采购单</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Restore dialog */}
      <AlertDialog open={!!restoreTarget} onOpenChange={open => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>恢复采购单 {restoreTarget?.po_number}？</AlertDialogTitle>
            <AlertDialogDescription>
              此采购单将移回活跃采购单列表。<br />
              <span className="text-muted-foreground/70">This purchase order will be moved back to the active list.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>确认恢复</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete step 1 */}
      <AlertDialog open={!!deleteTarget && !deleteConfirm2} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除采购单？</AlertDialogTitle>
            <AlertDialogDescription>
              确认要永久删除 <strong>{deleteTarget?.po_number}</strong>？此操作无法撤销，将同时删除所有明细行。<br />
              <span className="text-muted-foreground/70">Permanently delete {deleteTarget?.po_number}? This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => setDeleteConfirm2(true)}>
              继续
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete step 2 (double confirm) */}
      <AlertDialog open={deleteConfirm2} onOpenChange={open => !open && (setDeleteConfirm2(false))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>再次确认永久删除</AlertDialogTitle>
            <AlertDialogDescription>
              您即将永久删除 <strong>{deleteTarget?.po_number}</strong>，数据无法恢复。<br />
              <span className="text-muted-foreground/70">This is your final confirmation. Data cannot be recovered.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteConfirm2(false); setDeleteTarget(null); }}>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDeleteFinal}>
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}