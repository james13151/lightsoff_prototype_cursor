import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/lib/i18nContext';
import PartnerBillPage from './PartnerBillPage';
import SettlementPayDialog from '@/components/purchasing/SettlementPayDialog';
import moment from 'moment';

const PAYMENT_COLORS = {
  '未结算': 'text-red-400 bg-red-400/10',
  '部分结算': 'text-amber-400 bg-amber-400/10',
  '已结算': 'text-green-400 bg-green-400/10',
};

export default function SettlementPage({ currentUser, onNavigateToPO }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [selectedPOs, setSelectedPOs] = useState([]);
  const [payingPOs, setPayingPOs] = useState([]);
  const [activeSupplier, setActiveSupplier] = useState(null);
  // Payment records filter
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterPaySupplier, setFilterPaySupplier] = useState('all');

  const { data: pos = [] } = useQuery({
    queryKey: ['purchase_orders'],
    queryFn: () => base44.entities.PurchaseOrder.list('-created_date', 500),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payment_records'],
    queryFn: () => base44.entities.PaymentRecord.list('-payment_date', 500),
  });

  const suppliers = useMemo(() => [...new Set(pos.map(p => p.supplier_name).filter(Boolean))], [pos]);

  const currentMonth = moment().format('YYYY-MM');
  const monthlyTotal = pos.filter(p => moment(p.created_date).format('YYYY-MM') === currentMonth).reduce((s, p) => s + (p.total_amount || 0), 0);
  const unsettled = pos.filter(p => p.payment_status === '未结算').reduce((s, p) => s + (p.total_amount || 0), 0);
  const partial = pos.filter(p => p.payment_status === '部分结算').reduce((s, p) => s + (p.total_amount || 0), 0);
  const settled = pos.filter(p => p.payment_status === '已结算').reduce((s, p) => s + (p.total_amount || 0), 0);

  const getPaidForPO = (poNumber) => payments.filter(p => p.po_refs?.includes(poNumber)).reduce((s, p) => s + (p.amount_paid || 0), 0);

  const handlePay = (po) => {
    setPayingPOs([po]);
    setShowPayDialog(true);
  };

  const handleBatchPay = () => {
    if (!selectedPOs.length) return;
    setPayingPOs(selectedPOs);
    setShowPayDialog(true);
  };

  const displayedPOs = activeSupplier ? pos.filter(p => p.supplier_name === activeSupplier) : pos;
  const togglePOSelect = (po) => {
    setSelectedPOs(s => s.find(p => p.id === po.id) ? s.filter(p => p.id !== po.id) : [...s, po]);
  };

  // Payment records filtered
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (filterPaySupplier !== 'all' && p.supplier_name !== filterPaySupplier) return false;
      if (filterDateFrom && p.payment_date < filterDateFrom) return false;
      if (filterDateTo && p.payment_date > filterDateTo) return false;
      return true;
    });
  }, [payments, filterPaySupplier, filterDateFrom, filterDateTo]);

  const paymentSuppliers = useMemo(() => [...new Set(payments.map(p => p.supplier_name).filter(Boolean))], [payments]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <h1 className="text-[18px] font-semibold text-foreground mb-6">{t('nav_settlement')}</h1>

      <Tabs defaultValue="supplier">
        <TabsList className="mb-6 bg-muted/30 border border-thin border-border">
          <TabsTrigger value="supplier" className="text-[12px]">{t('nav_supplier_settlement')}</TabsTrigger>
          <TabsTrigger value="payment_records" className="text-[12px]">付款记录</TabsTrigger>
          <TabsTrigger value="partner" className="text-[12px]">{t('nav_operation_fee')}</TabsTrigger>
        </TabsList>

        <TabsContent value="supplier">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: t('settlement_monthly_total'), value: monthlyTotal, color: 'text-foreground' },
              { label: t('settlement_unsettled'), value: unsettled, color: 'text-red-400' },
              { label: t('settlement_partial'), value: partial, color: 'text-amber-400' },
              { label: t('settlement_settled'), value: settled, color: 'text-green-400' },
            ].map(c => (
              <div key={c.label} className="p-4 rounded-xl border border-thin border-border bg-card/50">
                <div className="text-[11px] text-muted-foreground mb-1">{c.label}</div>
                <div className={`text-[20px] font-bold ${c.color}`}>¥{c.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setActiveSupplier(null)} className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors ${!activeSupplier ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/[0.05]'}`}>全部</button>
              {suppliers.map(s => (
                <button key={s} onClick={() => setActiveSupplier(s === activeSupplier ? null : s)} className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors ${activeSupplier === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-white/[0.05]'}`}>{s}</button>
              ))}
            </div>
          </div>

          {selectedPOs.length > 0 && (
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[12px] text-muted-foreground">已选 {selectedPOs.length} 项</span>
              <Button size="sm" className="h-7 text-[12px]" onClick={handleBatchPay}>{t('action_batch_settle')}</Button>
              <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => setSelectedPOs([])}>清除选择</Button>
            </div>
          )}

          <div className="rounded-xl border border-thin border-border overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-thin border-border bg-muted/30">
                  <th className="px-3 py-2.5 w-8"></th>
                  {['PO号', '供应商', '总金额', '已付', '余额', '结算状态', '操作'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedPOs.map(po => {
                  const paid = getPaidForPO(po.po_number);
                  const remaining = Math.max(0, (po.total_amount || 0) - paid);
                  const isSelected = !!selectedPOs.find(p => p.id === po.id);
                  return (
                    <tr key={po.id} className={`border-b border-thin border-border hover:bg-white/[0.03] ${isSelected ? 'bg-primary/5' : ''}`}>
                      <td className="px-3 py-2.5">
                        {po.payment_status !== '已结算' && (
                          <Checkbox checked={isSelected} onCheckedChange={() => togglePOSelect(po)} />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {onNavigateToPO ? (
                          <button className="font-mono text-[12px] text-primary hover:underline" onClick={() => onNavigateToPO(po.id)}>{po.po_number}</button>
                        ) : (
                          <span className="font-mono text-[12px] text-primary">{po.po_number}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{po.supplier_name}</td>
                      <td className="px-4 py-2.5 font-semibold text-foreground">¥{(po.total_amount || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-green-400 font-medium">¥{paid.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-red-400 font-medium">¥{remaining.toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${PAYMENT_COLORS[po.payment_status] || ''}`}>{po.payment_status || '未结算'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {po.payment_status !== '已结算' && (
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => handlePay(po)}>{t('action_record_payment')}</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {displayedPOs.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-[13px]">{t('no_data')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Payment Records Tab */}
        <TabsContent value="payment_records">
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            <Select value={filterPaySupplier} onValueChange={setFilterPaySupplier}>
              <SelectTrigger className="h-8 text-[12px] w-36"><SelectValue placeholder="供应商" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部供应商</SelectItem>
                {paymentSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span>从</span>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 text-[12px] w-36" />
              <span>到</span>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 text-[12px] w-36" />
            </div>
            {(filterDateFrom || filterDateTo || filterPaySupplier !== 'all') && (
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); setFilterPaySupplier('all'); }}>
                清除筛选
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-thin border-border overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-thin border-border bg-muted/30">
                  {['付款日期时间', '供应商', '金额', '方式', '关联采购单', '备注', '记录人'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map(p => (
                  <tr key={p.id} className="border-b border-thin border-border hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                      {p.payment_datetime
                        ? moment(p.payment_datetime).format('YYYY-MM-DD HH:mm')
                        : p.payment_date}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.supplier_name}</td>
                    <td className="px-4 py-2.5 text-green-400 font-semibold">¥{(p.amount_paid || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.payment_method}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(p.po_refs || []).map((ref, i) => {
                          const poId = p.po_ref_ids?.[i];
                          return (
                            <span key={ref}>
                              {onNavigateToPO && poId ? (
                                <button
                                  className="font-mono text-[11px] text-primary hover:underline"
                                  onClick={() => onNavigateToPO(poId)}
                                >
                                  {ref}
                                </button>
                              ) : (
                                <span className="font-mono text-[11px] text-primary">{ref}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{p.notes || '-'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{p.created_by_name || '-'}</td>
                  </tr>
                ))}
                {filteredPayments.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-[13px]">暂无付款记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="partner" className="m-0 p-0">
          <PartnerBillPage currentUser={currentUser} />
        </TabsContent>
      </Tabs>

      {showPayDialog && payingPOs.length > 0 && (
        <SettlementPayDialog
          open={showPayDialog}
          onClose={() => { setShowPayDialog(false); setPayingPOs([]); }}
          pos={payingPOs}
          currentUser={currentUser}
          payments={payments}
          onPaid={() => {
            queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
            queryClient.invalidateQueries({ queryKey: ['payment_records'] });
            setShowPayDialog(false);
            setSelectedPOs([]);
            setPayingPOs([]);
          }}
        />
      )}
    </div>
  );
}