import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { isAdmin } from '@/lib/permissions';
import { toast } from 'sonner';

const EMPTY = { name: '', contact_person: '', contact_info: '', payment_terms: '', notes: '' };

// Defined outside component to prevent remount on every render (fixes input focus loss)
function FieldWrapper({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function SupplierManagementPage({ currentUser }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // supplier to delete
  const [blockWarning, setBlockWarning] = useState(null); // supplier blocked from deletion

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  // Find duplicate names (case-insensitive)
  const duplicateNames = useMemo(() => {
    const seen = {};
    suppliers.forEach(s => {
      const key = s.name.trim().toLowerCase();
      seen[key] = (seen[key] || 0) + 1;
    });
    return new Set(Object.entries(seen).filter(([, c]) => c > 1).map(([k]) => k));
  }, [suppliers]);

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => base44.entities.PurchaseOrder.list(),
  });

  const handleDeleteClick = (s) => {
    const activePOs = purchaseOrders.filter(po => po.supplier_name === s.name && !po.is_archived);
    if (activePOs.length > 0) {
      setBlockWarning(s);
    } else {
      setDeleteTarget(s);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await base44.entities.Supplier.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    toast.success('供应商已删除 / Supplier deleted');
    setDeleteTarget(null);
  };

  const openCreate = () => { setEditSupplier(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (s) => { setEditSupplier(s); setForm({ ...EMPTY, ...s }); setShowForm(true); };

  const isDuplicateName = (name) => {
    const lower = name.trim().toLowerCase();
    return suppliers.some(s => s.name.trim().toLowerCase() === lower && s.id !== editSupplier?.id);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (isDuplicateName(form.name)) {
      toast.warning(`已存在同名供应商「${form.name.trim()}」`);
      setSaving(false);
      return;
    }
    setSaving(true);
    if (editSupplier) {
      await base44.entities.Supplier.update(editSupplier.id, form);
    } else {
      await base44.entities.Supplier.create(form);
    }
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    setSaving(false);
    setShowForm(false);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[18px] font-semibold text-foreground">供应商管理</h1>
        <Button onClick={openCreate} className="h-8 text-[12px] gap-1.5">
          <Plus className="w-3.5 h-3.5" /> 新增供应商
        </Button>
      </div>

      <div className="grid gap-3">
        {suppliers.map(s => {
          const isDupe = duplicateNames.has(s.name.trim().toLowerCase());
          return (
          <div key={s.id} className={`p-4 rounded-xl border border-thin flex items-start justify-between gap-4 ${isDupe ? 'border-amber-500/50 bg-amber-500/5' : 'border-border bg-card/50'}`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[14px] text-foreground">{s.name}</span>
                {isDupe && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">重复</span>}
              </div>
              <div className="flex gap-4 mt-1 text-[12px] text-muted-foreground">
                {s.contact_person && <span>联系人：{s.contact_person}</span>}
                {s.contact_info && <span>{s.contact_info}</span>}
                {s.payment_terms && <span>付款条件：{s.payment_terms}</span>}
              </div>
              {s.notes && <div className="mt-1 text-[12px] text-muted-foreground/70">{s.notes}</div>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 gap-1" onClick={() => openEdit(s)}>
                <Pencil className="w-3 h-3" /> 编辑
              </Button>
              {isAdmin(currentUser) && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteClick(s)}>
                  <Trash2 className="w-3 h-3" /> 删除
                </Button>
              )}
            </div>
          </div>
          );
        })}
        {suppliers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-[13px]">暂无供应商</div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md p-0 rounded-xl">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="text-[15px] font-semibold">{editSupplier ? '编辑供应商' : '新增供应商'}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-5 space-y-4">
            <FieldWrapper label="供应商名称 *">
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 text-[13px]" />
            </FieldWrapper>
            <div className="grid grid-cols-2 gap-4">
              <FieldWrapper label="联系人">
                <Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} className="h-9 text-[13px]" />
              </FieldWrapper>
              <FieldWrapper label="联系方式">
                <Input value={form.contact_info} onChange={e => setForm(f => ({ ...f, contact_info: e.target.value }))} className="h-9 text-[13px]" />
              </FieldWrapper>
            </div>
            <FieldWrapper label="付款条件">
              <Input value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} className="h-9 text-[13px]" />
            </FieldWrapper>
            <FieldWrapper label="备注">
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-[13px]" />
            </FieldWrapper>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowForm(false)} className="h-8 text-[12px]">取消</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="h-8 text-[12px]">
                {saving ? '保存中...' : (editSupplier ? '保存修改' : '创建')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除供应商「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销。<br />
              <span className="text-muted-foreground/70">Delete supplier "{deleteTarget?.name}"? This cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block warning dialog */}
      <AlertDialog open={!!blockWarning} onOpenChange={open => !open && setBlockWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>无法删除供应商</AlertDialogTitle>
            <AlertDialogDescription>
              该供应商有进行中的采购单，无法删除。请先归档或完成相关采购单后再试。<br />
              <span className="text-muted-foreground/70">This supplier has active purchase orders. Please archive or complete them first.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>知道了</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}