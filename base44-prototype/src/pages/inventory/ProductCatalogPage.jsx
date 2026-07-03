import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Search, X, History } from 'lucide-react';
import { isAdmin } from '@/lib/permissions';
import { toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import ProductLedgerPanel from '@/components/inventory/ProductLedgerPanel';

const BRANDS = ['MINI', 'VW', 'Volvo', 'Honda', 'Audi', 'Porsche', '其他'];
const CATEGORIES = ['空气动力', '内饰配件', '转向系统', '脚垫配件', '其他'];
const DRIVE_SIDES = ['LHD', 'RHD', 'N/A'];
const TRANSMISSIONS = ['AT', 'MT', 'N/A'];

const EMPTY_FORM = {
  sku_id: '', name: '', name_en: '', category: '', brand_line: '', vehicle_model: '',
  material_spec: '', drive_side: 'N/A', transmission: 'N/A', design_embroidery: '',
  supplier_ids: [], supplier_names: [], last_po_price: 0, selling_price_usd: 0,
  safety_stock: 0, warehouse_location: '', keep_stock: true, notes: '',
};

// ── Product Edit Modal (defined outside to avoid remount) ────────────────────
function ProductModal({ open, onClose, product, suppliers, onSaved, isAdminUser }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Sync form when product changes
  React.useEffect(() => {
    if (open) {
      setForm(product ? { ...EMPTY_FORM, ...product } : { ...EMPTY_FORM });
    }
  }, [open, product]);

  const setField = useCallback((key, val) => setForm(f => ({ ...f, [key]: val })), []);

  const toggleSupplier = useCallback((supplier) => {
    setForm(f => {
      const ids = f.supplier_ids || [];
      const names = f.supplier_names || [];
      const idx = ids.indexOf(supplier.id);
      if (idx >= 0) {
        return { ...f, supplier_ids: ids.filter(id => id !== supplier.id), supplier_names: names.filter(n => n !== supplier.name) };
      }
      return { ...f, supplier_ids: [...ids, supplier.id], supplier_names: [...names, supplier.name] };
    });
  }, []);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (product?.id) {
      await base44.entities.Product.update(product.id, form);
    } else {
      await base44.entities.Product.create(form);
    }
    setSaving(false);
    toastSuccess(product?.id ? '产品已更新' : '产品已创建');
    onSaved();
    onClose();
  };

  const F = ({ label, children, className }) => (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 rounded-xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-thin border-border flex-shrink-0">
          <DialogTitle className="text-[15px] font-semibold">{product?.id ? '编辑产品' : '新增产品'}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-5 pt-4 overflow-y-auto custom-scrollbar space-y-4">
          {/* Row 1: SKU + Names */}
          <div className="grid grid-cols-3 gap-3">
            <F label="SKU编号">
              <Input value={form.sku_id} onChange={e => setField('sku_id', e.target.value)} placeholder="SKU-001" className="h-9 text-[13px]" />
            </F>
            <F label="产品名称（中）*">
              <Input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="产品名称" className="h-9 text-[13px]" />
            </F>
            <F label="Product Name (EN)">
              <Input value={form.name_en} onChange={e => setField('name_en', e.target.value)} placeholder="English name" className="h-9 text-[13px]" />
            </F>
          </div>

          {/* Row 2: Brand + Category + Vehicle */}
          <div className="grid grid-cols-3 gap-3">
            <F label="品牌">
              <Select value={form.brand_line || ''} onValueChange={v => setField('brand_line', v)}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择品牌" /></SelectTrigger>
                <SelectContent>{BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="产品类型">
              <Select value={form.category || ''} onValueChange={v => setField('category', v)}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择类型" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="车型">
              <Input value={form.vehicle_model} onChange={e => setField('vehicle_model', e.target.value)} placeholder="e.g. F55/F56" className="h-9 text-[13px]" />
            </F>
          </div>

          {/* Row 3: Drive + Transmission + Material */}
          <div className="grid grid-cols-3 gap-3">
            <F label="驾驶位">
              <Select value={form.drive_side || 'N/A'} onValueChange={v => setField('drive_side', v)}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>{DRIVE_SIDES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="变速箱">
              <Select value={form.transmission || 'N/A'} onValueChange={v => setField('transmission', v)}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>{TRANSMISSIONS.map(tx => <SelectItem key={tx} value={tx}>{tx}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="材质/规格">
              <Input value={form.material_spec} onChange={e => setField('material_spec', e.target.value)} placeholder="材质或规格" className="h-9 text-[13px]" />
            </F>
          </div>

          {/* Row 4: Design + Prices */}
          <div className="grid grid-cols-3 gap-3">
            <F label="设计/刺绣">
              <Input value={form.design_embroidery} onChange={e => setField('design_embroidery', e.target.value)} placeholder="刺绣备注" className="h-9 text-[13px]" />
            </F>
            <F label="上次采购价（¥）">
              <Input type="number" min="0" value={form.last_po_price} onChange={e => setField('last_po_price', parseFloat(e.target.value) || 0)} className="h-9 text-[13px]" />
            </F>
            <F label="售价（$）">
              <Input type="number" min="0" value={form.selling_price_usd} onChange={e => setField('selling_price_usd', parseFloat(e.target.value) || 0)} className="h-9 text-[13px]" />
            </F>
          </div>

          {/* Row 5: Suppliers */}
          <F label="关联供应商（可多选）">
            <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border min-h-[44px]">
              {suppliers.map(s => {
                const linked = (form.supplier_ids || []).includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSupplier(s)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-[12px] border transition-colors',
                      linked
                        ? 'bg-primary/20 border-primary text-primary font-medium'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {linked && <span className="mr-1">✓</span>}{s.name}
                  </button>
                );
              })}
              {suppliers.length === 0 && <span className="text-[12px] text-muted-foreground">暂无供应商</span>}
            </div>
          </F>

          {/* Row 6: Safety stock + Warehouse location */}
          <div className="grid grid-cols-2 gap-4">
            <F label="安全库存">
              <Input type="number" min="0" value={form.safety_stock ?? 0} onChange={e => setField('safety_stock', Number(e.target.value))} className="h-9 text-[13px]" />
            </F>
            <F label="仓位">
              <Input value={form.warehouse_location ?? ''} onChange={e => setField('warehouse_location', e.target.value)} placeholder="如 A-02" className="h-9 text-[13px]" />
            </F>
          </div>

          {/* Row 7: Keep stock + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <F label="备库存">
              <div className="flex items-center gap-3 h-9">
                <Switch checked={form.keep_stock} onCheckedChange={v => setField('keep_stock', v)} />
                <span className="text-[12px] text-muted-foreground">{form.keep_stock ? '备库存' : '按需生产（不跟踪库存）'}</span>
              </div>
            </F>
            <F label="备注">
              <Input value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="备注" className="h-9 text-[13px]" />
            </F>
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-2 flex-shrink-0 border-t border-thin border-border pt-4">
          <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="h-8 text-[12px]">
            {saving ? '保存中...' : (product?.id ? '保存修改' : '创建产品')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function ProductCatalogPage({ currentUser }) {
  const queryClient = useQueryClient();
  const userIsAdmin = isAdmin(currentUser);

  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [ledgerProduct, setLedgerProduct] = useState(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const filtered = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.sku_id?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.name_en?.toLowerCase().includes(q)
      );
    }
    if (filterBrand) list = list.filter(p => p.brand_line === filterBrand);
    if (filterSupplier) list = list.filter(p => (p.supplier_ids || []).includes(filterSupplier));
    return list;
  }, [products, search, filterBrand, filterSupplier]);

  const openCreate = useCallback(() => { setEditProduct(null); setModalOpen(true); }, []);
  const openEdit = useCallback((p) => { setEditProduct(p); setModalOpen(true); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await base44.entities.Product.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ['products'] });
    toastSuccess('产品已删除');
    setDeleteTarget(null);
  };

  const handleSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
  }, [queryClient]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-thin border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[18px] font-semibold text-foreground">产品目录</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">Product Catalog · {products.length} SKUs</p>
          </div>
          <Button onClick={openCreate} className="h-8 text-[12px] gap-1.5">
            <Plus className="w-3.5 h-3.5" /> 新增产品
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索 SKU 或产品名称..."
              className="pl-8 h-8 text-[12px]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="h-8 text-[12px] w-[130px]">
              <SelectValue placeholder="全部品牌" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>全部品牌</SelectItem>
              {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="h-8 text-[12px] w-[140px]">
              <SelectValue placeholder="全部供应商" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>全部供应商</SelectItem>
              {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterBrand || filterSupplier) && (
            <Button variant="ghost" size="sm" className="h-8 text-[11px] px-2" onClick={() => { setFilterBrand(''); setFilterSupplier(''); }}>
              <X className="w-3 h-3 mr-1" />清除筛选
            </Button>
          )}
          <span className="text-[11px] text-muted-foreground ml-auto">{filtered.length} 条</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-[13px]">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-[13px]">暂无产品</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10 bg-muted/30 backdrop-blur-sm border-b border-thin border-border">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">SKU</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">产品名称</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">品牌</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">车型</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">类型</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">材质/规格</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">关联供应商</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">采购价(¥)</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">售价($)</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">备注</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr
                  key={p.id}
                  className={cn('border-b border-thin border-border hover:bg-white/[0.03] transition-colors', i % 2 === 1 && 'bg-white/[0.01]')}
                >
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{p.sku_id || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{p.name}</div>
                    {p.name_en && <div className="text-muted-foreground text-[11px]">{p.name_en}</div>}
                    {p.keep_stock === false && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5 border-amber-500/40 text-amber-400">按需生产</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.brand_line || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.vehicle_model || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.category || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{p.material_spec || '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(p.supplier_names || []).length > 0
                        ? p.supplier_names.map((sn, si) => (
                          <span key={si} className="px-1.5 py-0.5 rounded text-[10px] bg-secondary/50 text-foreground">{sn}</span>
                        ))
                        : <span className="text-muted-foreground">—</span>
                      }
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-foreground whitespace-nowrap">
                    {p.last_po_price ? `¥${Number(p.last_po_price).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-foreground whitespace-nowrap">
                    {p.selling_price_usd ? `$${Number(p.selling_price_usd).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[120px] truncate">{p.notes || '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => setLedgerProduct(p)}>
                        <History className="w-3 h-3" />记录
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => openEdit(p)}>
                        <Pencil className="w-3 h-3" />编辑
                      </Button>
                      {userIsAdmin && (
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Product Modal */}
      <ProductModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editProduct}
        suppliers={suppliers}
        onSaved={handleSaved}
        isAdminUser={userIsAdmin}
      />

      {/* Ledger Panel */}
      {ledgerProduct && (
        <ProductLedgerPanel product={ledgerProduct} onClose={() => setLedgerProduct(null)} />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除产品</AlertDialogTitle>
            <AlertDialogDescription>
              删除「{deleteTarget?.name}」后无法恢复。确认操作？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}