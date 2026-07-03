import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSettings } from '@/lib/settingsContext';
import { isAdmin, isPartner } from '@/lib/permissions';
import { useI18n } from '@/lib/i18nContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Download } from 'lucide-react';
import moment from 'moment';

export default function PartnerBillPage({ currentUser }) {
  const { settings } = useSettings();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const userIsAdmin = isAdmin(currentUser);
  const userIsPartner = isPartner(currentUser);

  const [filterPartner, setFilterPartner] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState(moment().format('YYYY-MM'));
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [settling, setSettling] = useState(false);
  const [settleNote, setSettleNote] = useState('');

  const { data: feeRecords = [] } = useQuery({
    queryKey: ['fee_records'],
    queryFn: () => base44.entities.FeeRecord.list('-date', 500),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: userIsAdmin,
  });

  const partners = useMemo(() => users.filter(u => u.role === 'partner'), [users]);

  const displayRecords = useMemo(() => {
    let recs = feeRecords;
    if (userIsPartner) {
      recs = recs.filter(r => r.partner_user_ref === currentUser?.id);
    } else if (filterPartner !== 'all') {
      recs = recs.filter(r => r.partner_user_ref === filterPartner);
    }
    if (filterStatus !== 'all') {
      recs = recs.filter(r => r.status === filterStatus);
    }
    if (filterMonth) {
      recs = recs.filter(r => r.date && r.date.startsWith(filterMonth));
    }
    return recs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [feeRecords, filterPartner, filterStatus, filterMonth, userIsPartner, currentUser]);

  const totalFee = displayRecords.reduce((s, r) => s + (r.total_fee || 0), 0);
  const unsettledFee = displayRecords.filter(r => r.status === '未结算').reduce((s, r) => s + (r.total_fee || 0), 0);
  const settledFee = displayRecords.filter(r => r.status === '已结算').reduce((s, r) => s + (r.total_fee || 0), 0);

  const toggleSelect = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const selectAllUnsettled = () => {
    setSelectedIds(displayRecords.filter(r => r.status === '未结算').map(r => r.id));
  };

  const handleSettle = async () => {
    setSettling(true);
    for (const id of selectedIds) {
      await base44.entities.FeeRecord.update(id, { status: '已结算' });
    }
    queryClient.invalidateQueries({ queryKey: ['fee_records'] });
    setSettling(false);
    setShowSettleDialog(false);
    setSelectedIds([]);
    setSettleNote('');
  };

  const handleExport = () => {
    const rows = [
      [t('bill_date'), 'Partner', t('bill_product'), t('bill_qty'), `${t('bill_unit_fee')} (¥)`, `${t('bill_amount')} (¥)`, t('bill_status')],
      ...displayRecords.map(r => [r.date, r.partner_name || '', r.sku_name || '', r.quantity, r.unit_fee, r.total_fee, r.status]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement_${filterMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const feeRate = settings?.operation_fee_rate ?? 5;
  const monthOptions = Array.from({ length: 12 }, (_, i) => moment().subtract(i, 'months').format('YYYY-MM'));

  // Status display helper — Partner sees English
  const statusDisplay = (status) => {
    if (status === '已结算') return { label: userIsPartner ? 'Paid in Full' : t('settlement_settled'), cls: 'text-green-400 bg-green-400/10' };
    if (status === '未结算') return { label: userIsPartner ? 'Unpaid' : t('settlement_unsettled'), cls: 'text-red-400 bg-red-400/10' };
    if (status === '部分结算') return { label: userIsPartner ? 'Partially Paid' : t('settlement_partial'), cls: 'text-amber-400 bg-amber-400/10' };
    return { label: status, cls: '' };
  };

  return (
    <div className={userIsPartner ? 'flex-1 overflow-y-auto custom-scrollbar p-6' : ''}>
      {userIsPartner && (
        <h1 className="text-[18px] font-semibold text-foreground mb-6">{t('bill_title')}</h1>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl border border-thin border-border bg-card/50">
          <div className="text-[11px] text-muted-foreground mb-1">{t('bill_total')}</div>
          <div className="text-[20px] font-bold text-foreground">¥{totalFee.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{displayRecords.length} {t('bill_records')}</div>
        </div>
        <div className="p-4 rounded-xl border border-thin border-border bg-card/50">
          <div className="text-[11px] text-muted-foreground mb-1">{userIsPartner ? 'Outstanding Balance' : t('bill_unsettled')}</div>
          <div className="text-[20px] font-bold text-red-400">¥{unsettledFee.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {displayRecords.filter(r => r.status === '未结算').length} {userIsPartner ? 'unpaid' : t('bill_unsettled_count')}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-thin border-border bg-card/50">
          <div className="text-[11px] text-muted-foreground mb-1">{userIsPartner ? 'Paid' : t('bill_settled')}</div>
          <div className="text-[20px] font-bold text-green-400">¥{settledFee.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{t('bill_fee_rate')}: ¥{feeRate}/{userIsPartner ? 'order' : '单'}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="h-8 w-32 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>

        {userIsAdmin && (
          <Select value={filterPartner} onValueChange={setFilterPartner}>
            <SelectTrigger className="h-8 w-36 text-[12px]"><SelectValue placeholder={t('bill_all_partners')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('bill_all_partners')}</SelectItem>
              {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-28 text-[12px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{userIsPartner ? 'All Statuses' : t('bill_all_status')}</SelectItem>
            <SelectItem value="未结算">{userIsPartner ? 'Unpaid' : t('settlement_unsettled')}</SelectItem>
            <SelectItem value="已结算">{userIsPartner ? 'Paid in Full' : t('settlement_settled')}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {userIsAdmin && selectedIds.length > 0 && (
          <Button size="sm" className="h-7 text-[12px] gap-1.5" onClick={() => setShowSettleDialog(true)}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {t('bill_settle_selected')} ({selectedIds.length})
          </Button>
        )}
        {userIsAdmin && (
          <Button variant="ghost" size="sm" className="h-7 text-[12px]" onClick={selectAllUnsettled}>
            {t('bill_select_all_unsettled')}
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-7 text-[12px] gap-1.5" onClick={handleExport}>
          <Download className="w-3.5 h-3.5" /> {userIsPartner ? t('action_export') : t('bill_export_csv')}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-thin border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-thin border-border bg-muted/30">
              {userIsAdmin && <th className="px-3 py-2.5 w-8"></th>}
              {[t('bill_date'), ...(userIsAdmin ? ['Partner'] : []), t('bill_product'), t('bill_qty'), t('bill_unit_fee'), t('bill_amount'), t('bill_status')].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRecords.map(r => {
              const isSelected = selectedIds.includes(r.id);
              const sd = statusDisplay(r.status);
              return (
                <tr key={r.id} className={`border-b border-thin border-border hover:bg-white/[0.03] transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                  {userIsAdmin && (
                    <td className="px-3 py-2.5">
                      {r.status === '未结算' && (
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} className="w-3.5 h-3.5 accent-primary" />
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-muted-foreground">{r.date}</td>
                  {userIsAdmin && <td className="px-4 py-2.5 text-foreground font-medium">{r.partner_name || '-'}</td>}
                  <td className="px-4 py-2.5 text-foreground">{r.sku_name || '-'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.quantity}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">¥{r.unit_fee}</td>
                  <td className="px-4 py-2.5 font-semibold text-foreground">¥{(r.total_fee || 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${sd.cls}`}>{sd.label}</span>
                  </td>
                </tr>
              );
            })}
            {displayRecords.length === 0 && (
              <tr><td colSpan={userIsAdmin ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground text-[13px]">{t('bill_no_records')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Settle dialog */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent className="max-w-sm p-0 rounded-xl">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="text-[15px] font-semibold">{t('bill_confirm_settle')}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-5 space-y-4">
            <p className="text-[13px] text-muted-foreground">
              Mark <span className="text-foreground font-medium">{selectedIds.length}</span> records as settled,
              total <span className="text-primary font-semibold">
                ¥{displayRecords.filter(r => selectedIds.includes(r.id)).reduce((s, r) => s + (r.total_fee || 0), 0).toLocaleString()}
              </span>
            </p>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">{t('bill_settle_note')}</Label>
              <Input value={settleNote} onChange={e => setSettleNote(e.target.value)} placeholder={t('bill_settle_placeholder')} className="h-9 text-[13px]" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setShowSettleDialog(false)} className="h-8 text-[12px]">{t('action_cancel')}</Button>
              <Button onClick={handleSettle} disabled={settling} className="h-8 text-[12px]">
                {settling ? t('bill_processing') : t('bill_confirm_btn')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}