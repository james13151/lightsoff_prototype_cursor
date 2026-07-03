import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isAdmin } from '@/lib/permissions';
import { useI18n } from '@/lib/i18nContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, CheckCircle2, Download, Camera } from 'lucide-react';
import moment from 'moment';

const CATEGORIES_ZH = ['办公用品', '货款', '运费', '其他'];

export default function ExpensePage({ currentUser, view = 'this_month' }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const userIsAdmin = isAdmin(currentUser);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [settleNote, setSettleNote] = useState('');
  const [settling, setSettling] = useState(false);
  const [filterUser, setFilterUser] = useState('all');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const currentMonth = moment().format('YYYY-MM');

  const { data: expenseRecords = [] } = useQuery({
    queryKey: ['expense_records'],
    queryFn: () => base44.entities.ExpenseRecord.list('-date', 500),
    enabled: !!currentUser,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: userIsAdmin,
  });

  const staffUsers = useMemo(() => users.filter(u => u.role === 'staff' || u.role === 'admin'), [users]);

  const displayRecords = useMemo(() => {
    let recs = expenseRecords;
    if (!userIsAdmin) {
      recs = recs.filter(r => r.submitted_by_id === currentUser?.id);
    } else if (filterUser !== 'all') {
      recs = recs.filter(r => r.submitted_by_id === filterUser);
    }
    if (view === 'this_month') {
      recs = recs.filter(r => r.date?.startsWith(currentMonth));
    }
    return recs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [expenseRecords, userIsAdmin, currentUser, filterUser, view, currentMonth]);

  const totalAmount = displayRecords.reduce((s, r) => s + (r.amount || 0), 0);
  const unpaidAmount = displayRecords.filter(r => r.status === '未还').reduce((s, r) => s + (r.amount || 0), 0);

  const toggleSelect = (id) => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const selectAllUnsettled = () => setSelectedIds(displayRecords.filter(r => r.status === '未还').map(r => r.id));

  const handleSettle = async () => {
    setSettling(true);
    for (const id of selectedIds) {
      await base44.entities.ExpenseRecord.update(id, { status: '已还', settled_note: settleNote });
    }
    queryClient.invalidateQueries({ queryKey: ['expense_records'] });
    setSettling(false);
    setShowSettleDialog(false);
    setSelectedIds([]);
    setSettleNote('');
  };

  const handleExport = () => {
    const rows = [
      ['日期', '类型', '金额', '备注', '提交人', '状态'],
      ...displayRecords.map(r => [r.date, r.category, r.amount, r.note || '', r.submitted_by_name || '', r.status]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `expenses_${currentMonth}.csv`;
    a.click();
  };

  const CATEGORY_LABELS = {
    '办公用品': t('expense_office'),
    '货款': t('expense_goods'),
    '运费': t('expense_shipping'),
    '其他': t('expense_other'),
  };

  const CATEGORY_COLORS = {
    '办公用品': 'text-blue-400 bg-blue-400/10',
    '货款': 'text-purple-400 bg-purple-400/10',
    '运费': 'text-sky-400 bg-sky-400/10',
    '其他': 'text-muted-foreground bg-white/5',
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-[18px] font-semibold text-foreground">{t('expense_title')}</h1>
          <div className="flex items-center gap-2">
            {userIsAdmin && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-[12px] gap-1" onClick={handleExport}>
                  <Download className="w-3.5 h-3.5" /> {t('action_export')}
                </Button>
                {selectedIds.length > 0 && (
                  <Button size="sm" className="h-7 text-[12px] gap-1" onClick={() => setShowSettleDialog(true)}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t('expense_mark_settled')} ({selectedIds.length})
                  </Button>
                )}
              </>
            )}
            {!userIsAdmin && (
              <Button size="sm" className="h-8 text-[13px] gap-1.5" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4" /> {t('expense_add')}
              </Button>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-4 rounded-xl border border-border bg-card/50">
            <div className="text-[11px] text-muted-foreground mb-1">{t('expense_monthly_total')}</div>
            <div className="text-[22px] font-bold text-foreground">¥{totalAmount.toLocaleString()}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{displayRecords.length} 笔</div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card/50">
            <div className="text-[11px] text-muted-foreground mb-1">{t('expense_outstanding')}</div>
            <div className="text-[22px] font-bold" style={{ color: unpaidAmount > 0 ? '#f9a825' : '#4caf50' }}>
              ¥{unpaidAmount.toLocaleString()}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {displayRecords.filter(r => r.status === '未还').length} 笔未还
            </div>
          </div>
        </div>

        {/* Admin filters */}
        {userIsAdmin && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="h-8 w-36 text-[12px]"><SelectValue placeholder="全部人员" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部人员</SelectItem>
                {staffUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {displayRecords.filter(r => r.status === '未还').length > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={selectAllUnsettled}>
                全选未还
              </Button>
            )}
          </div>
        )}

        {/* Records list */}
        {displayRecords.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <div className="text-3xl mb-3">👌</div>
            <p className="text-[14px]">{t('expense_empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayRecords.map(r => {
              const isSettled = r.status === '已还';
              const isSelected = selectedIds.includes(r.id);
              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border border-border transition-colors ${isSelected ? 'bg-primary/5 border-primary/20' : 'bg-card/40 hover:bg-card/70'}`}
                >
                  {userIsAdmin && r.status === '未还' && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(r.id)}
                      className="w-3.5 h-3.5 accent-primary flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${CATEGORY_COLORS[r.category] || CATEGORY_COLORS['其他']}`}>
                        {CATEGORY_LABELS[r.category] || r.category}
                      </span>
                      {userIsAdmin && r.submitted_by_name && (
                        <span className="text-[11px] text-muted-foreground">{r.submitted_by_name}</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-3 mt-1 ${isSettled ? 'opacity-50' : ''}`}>
                      <span className={`text-[15px] font-semibold ${isSettled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        ¥{(r.amount || 0).toLocaleString()}
                      </span>
                      {r.note && <span className="text-[12px] text-muted-foreground truncate">{r.note}</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{r.date}</div>
                  </div>
                  <div className="flex-shrink-0">
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${isSettled ? 'text-green-400 bg-green-400/10' : 'text-amber-400 bg-amber-400/10'}`}>
                      {isSettled ? t('expense_settled') : t('expense_unpaid')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Expense Dialog (staff) */}
      <AddExpenseDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        currentUser={currentUser}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['expense_records'] })}
        categoryLabels={CATEGORY_LABELS}
        t={t}
      />

      {/* Settle Dialog (admin) */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent className="max-w-sm p-0 rounded-xl">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="text-[15px] font-semibold">{t('expense_mark_settled')}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-5 space-y-4">
            <p className="text-[13px] text-muted-foreground">
              将 <span className="text-foreground font-medium">{selectedIds.length}</span> 条记录标为已还，
              合计 <span className="font-semibold text-primary">
                ¥{displayRecords.filter(r => selectedIds.includes(r.id)).reduce((s, r) => s + (r.amount || 0), 0).toLocaleString()}
              </span>
            </p>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">备注（如：微信转了）</Label>
              <Input value={settleNote} onChange={e => setSettleNote(e.target.value)} placeholder="可选" className="h-9 text-[13px]" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setShowSettleDialog(false)} className="h-8 text-[12px]">{t('action_cancel')}</Button>
              <Button onClick={handleSettle} disabled={settling} className="h-8 text-[12px]">
                {settling ? '处理中...' : t('action_confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddExpenseDialog({ open, onClose, currentUser, onSaved, categoryLabels, t }) {
  const [form, setForm] = useState({ date: moment().format('YYYY-MM-DD'), category: '办公用品', amount: '', note: '', attachment: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) setForm({ date: moment().format('YYYY-MM-DD'), category: '办公用品', amount: '', note: '', attachment: '' });
  }, [open]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(f => ({ ...f, attachment: file_url }));
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.amount) return;
    setSaving(true);
    await base44.entities.ExpenseRecord.create({
      ...form,
      amount: Number(form.amount),
      submitted_by_id: currentUser?.id,
      submitted_by_name: currentUser?.full_name,
      status: '未还',
    });
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
      <DialogContent className="max-w-sm p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-[15px] font-semibold">{t('expense_add')}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <F label="日期">
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-[13px]" />
            </F>
            <F label="类型">
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          </div>
          <F label="金额 (¥) *">
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="h-9 text-[13px]" />
          </F>
          <F label="备注">
            <Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="说明一下花在哪里了" className="h-9 text-[13px]" />
          </F>
          <F label="拍照凭证（可选）">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer flex items-center gap-1.5 text-[12px] text-muted-foreground border border-border rounded-lg px-3 py-2 hover:bg-white/5 transition-colors">
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} className="hidden" />
                <Camera className="w-3.5 h-3.5" />
                {uploading ? '上传中...' : (form.attachment ? '已上传 ✓' : '拍照上传')}
              </label>
            </div>
          </F>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">{t('action_cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || !form.amount} className="h-8 text-[12px]">
              {saving ? '保存中...' : '记下来 ✓'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}