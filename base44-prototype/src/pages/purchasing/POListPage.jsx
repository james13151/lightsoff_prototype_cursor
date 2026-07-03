import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';

const RECEIPT_STATUS_COLORS = {
  '未收货': 'text-muted-foreground bg-muted/30',
  '部分收货': 'text-amber-400 bg-amber-400/10',
  '收货完成': 'text-green-400 bg-green-400/10',
  '关闭': 'text-muted-foreground bg-muted/20',
};
import CreatePODialog from '@/components/purchasing/CreatePODialog';
import { isSupplier } from '@/lib/permissions';
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

export default function POListPage({ currentUser, onSelectPO }) {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const queryClient = useQueryClient();

  const { data: allPOs = [] } = useQuery({
    queryKey: ['purchase_orders'],
    queryFn: () => base44.entities.PurchaseOrder.list('-created_date', 500),
    refetchInterval: 15000,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const pos = useMemo(() => {
    let list = allPOs.filter(po => !po.is_archived);
    if (isSupplier(currentUser)) {
      list = list.filter(po => po.supplier_name === currentUser?.full_name);
    }
    if (search) list = list.filter(po => po.po_number?.includes(search) || po.supplier_name?.includes(search));
    if (filterSupplier !== 'all') list = list.filter(po => po.supplier_name === filterSupplier);
    if (filterStatus !== 'all') list = list.filter(po => po.production_status === filterStatus);
    if (filterPayment !== 'all') list = list.filter(po => po.payment_status === filterPayment);
    return list;
  }, [allPOs, search, filterSupplier, filterStatus, filterPayment, currentUser]);

  const supplierNames = [...new Set(allPOs.map(p => p.supplier_name).filter(Boolean))];

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[18px] font-semibold text-foreground">采购订单</h1>
        <Button onClick={() => setShowCreate(true)} className="h-8 text-[12px] gap-1.5">
          <Plus className="w-3.5 h-3.5" /> 新建采购单
        </Button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索PO号或供应商" className="h-8 pl-8 text-[12px] w-44" />
        </div>
        {!isSupplier(currentUser) && (
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="h-8 text-[12px] w-36"><SelectValue placeholder="供应商" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部供应商</SelectItem>
              {supplierNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-[12px] w-36"><SelectValue placeholder="状态" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {['草稿','待供应商确认','生产中','已发货','已收货','已取消'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {!isSupplier(currentUser) && (
          <Select value={filterPayment} onValueChange={setFilterPayment}>
            <SelectTrigger className="h-8 text-[12px] w-32"><SelectValue placeholder="结算" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部结算</SelectItem>
              {['未结算','部分结算','已结算'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-xl border border-thin border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-thin border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">PO号</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">供应商</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">产品摘要</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">总金额</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">生产状态</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">收货状态</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">预计到货</th>
              {!isSupplier(currentUser) && <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">结算状态</th>}
              <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {pos.map(po => (
              <tr key={po.id} className="border-b border-thin border-border hover:bg-white/[0.03] cursor-pointer" onClick={() => onSelectPO(po.id)}>
                <td className="px-4 py-2.5 font-mono text-[12px] text-primary">{po.po_number || '-'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{po.supplier_name}</td>
                <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate">{po.other_notes || po.vehicle_model || '-'}</td>
                <td className="px-4 py-2.5 font-semibold text-foreground">¥{(po.total_amount || 0).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${STATUS_COLORS[po.production_status] || ''}`}>{po.production_status}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${RECEIPT_STATUS_COLORS[po.receipt_status || '未收货'] || ''}`}>{po.receipt_status || '未收货'}</span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-[12px]">
                  {po.expected_ship_date ? moment(po.expected_ship_date).format('MM-DD') : '-'}
                </td>
                {!isSupplier(currentUser) && (
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${PAYMENT_COLORS[po.payment_status] || ''}`}>{po.payment_status || '未结算'}</span>
                  </td>
                )}
                <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => onSelectPO(po.id)}>详情</Button>
                </td>
              </tr>
            ))}
            {pos.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-[13px]">暂无采购单</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <CreatePODialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        currentUser={currentUser}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
          setShowCreate(false);
          if (id) onSelectPO(id);
        }}
      />
    </div>
  );
}