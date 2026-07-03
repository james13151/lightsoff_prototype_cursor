import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';
import ProductFormDialog from '@/components/inventory/ProductFormDialog';
import { isAdmin, isStaff, isPartner, canSeeShanghai } from '@/lib/permissions';
import { useI18n } from '@/lib/i18nContext';

function warehouseStatus(qty, safetyStock) {
  if (qty <= 0) return { label: '缺货', labelEn: 'Out of Stock', color: 'text-red-400 bg-red-400/10' };
  if (qty < safetyStock) return { label: '库存偏低', labelEn: 'Low Stock', color: 'text-amber-400 bg-amber-400/10' };
  return { label: '库存正常', labelEn: 'In Stock', color: 'text-green-400 bg-green-400/10' };
}

export default function InventoryOverview({ currentUser }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const showShanghai = canSeeShanghai(currentUser);
  const userIsPartner = isPartner(currentUser);
  const canEdit = isAdmin(currentUser) || isStaff(currentUser);
  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [warehouseView, setWarehouseView] = useState(userIsPartner ? 'Tucson仓' : '全部');

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const { data: stocks = [] } = useQuery({
    queryKey: ['inventory_stocks'],
    queryFn: () => base44.entities.InventoryStock.list('-created_date', 1000),
  });

  // Build per-SKU stock map
  const stockMap = useMemo(() => {
    const map = {};
    for (const s of stocks) {
      if (!map[s.sku_ref]) map[s.sku_ref] = { shanghai: null, tucson: null };
      if (s.warehouse === '上海仓') map[s.sku_ref].shanghai = s;
      if (s.warehouse === 'Tucson仓') map[s.sku_ref].tucson = s;
    }
    return map;
  }, [stocks]);

  const filtered = products.filter(p => {
    if (!p.name?.toLowerCase().includes(search.toLowerCase()) && !p.sku_id?.toLowerCase().includes(search.toLowerCase()) && search) return false;
    if (filterBrand !== 'all' && p.brand_line !== filterBrand) return false;
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    return true;
  });

  const statusLabel = (s) => locale === 'en' ? s.labelEn : s.label;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[18px] font-semibold text-foreground">{t('nav_inventory_overview')}</h1>
        {canEdit && (
          <Button onClick={() => { setEditProduct(null); setShowForm(true); }} className="h-8 text-[12px] gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {t('inv_add_sku')}
          </Button>
        )}
      </div>

      {/* Warehouse toggle */}
      {!userIsPartner && (
        <div className="flex gap-1 mb-4">
          {[
            { key: '全部', label: t('all_warehouses') },
            { key: '上海仓', label: t('warehouse_shanghai') },
            { key: 'Tucson仓', label: t('warehouse_tucson') },
          ].map(w => (
            <button
              key={w.key}
              onClick={() => setWarehouseView(w.key)}
              className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-colors ${
                warehouseView === w.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('action_search')} className="h-8 pl-8 text-[12px] w-48" />
        </div>
        <Select value={filterBrand} onValueChange={setFilterBrand}>
          <SelectTrigger className="h-8 text-[12px] w-32"><SelectValue placeholder={t('inv_all_brands')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('inv_all_brands')}</SelectItem>
            {['MINI', 'VW', 'Volvo', '其他'].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 text-[12px] w-36"><SelectValue placeholder={t('inv_all_categories')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('inv_all_categories')}</SelectItem>
            {['空气动力', '内饰配件', '转向系统', '脚垫配件', '其他'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-thin border-border overflow-x-auto">
        <table className="w-full text-[13px] min-w-[900px]">
          <thead>
            <tr className="border-b border-thin border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_sku')}</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_name')}</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_category')}</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_brand')}</th>
              {(warehouseView === '全部' || warehouseView === '上海仓') && showShanghai && <>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_shanghai_qty')}</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_shanghai_status')}</th>
              </>}
              {(warehouseView === '全部' || warehouseView === 'Tucson仓') && <>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_tucson_qty')}</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_tucson_status')}</th>
              </>}
              {warehouseView === '全部' && showShanghai && <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_total')}</th>}
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_safety')}</th>
              {canEdit && <th className="px-4 py-2.5 text-right text-[11px] font-medium text-muted-foreground">{t('inv_actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const sk = stockMap[p.id] || {};
              const shanghaiQty = sk.shanghai?.quantity ?? 0;
              const tucsonQty = sk.tucson?.quantity ?? 0;
              const totalQty = shanghaiQty + tucsonQty;
              const shanghaiSt = warehouseStatus(shanghaiQty, p.safety_stock ?? 0);
              const tucsonSt = warehouseStatus(tucsonQty, p.safety_stock ?? 0);
              return (
                <tr key={p.id} className="border-b border-thin border-border hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{p.sku_id || '-'}</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.category || '-'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.brand_line || '-'}</td>
                  {(warehouseView === '全部' || warehouseView === '上海仓') && showShanghai && <>
                    <td className="px-4 py-2.5 font-semibold text-foreground">{shanghaiQty}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${shanghaiSt.color}`}>{statusLabel(shanghaiSt)}</span>
                    </td>
                  </>}
                  {(warehouseView === '全部' || warehouseView === 'Tucson仓') && <>
                    <td className="px-4 py-2.5 font-semibold text-foreground">{tucsonQty}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tucsonSt.color}`}>{statusLabel(tucsonSt)}</span>
                    </td>
                  </>}
                  {warehouseView === '全部' && showShanghai && <td className="px-4 py-2.5 font-semibold text-primary">{totalQty}</td>}
                  <td className="px-4 py-2.5 text-muted-foreground">{p.safety_stock ?? 0}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => { setEditProduct(p); setShowForm(true); }}>
                        {t('action_edit')}
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={15} className="px-4 py-8 text-center text-muted-foreground text-[13px]">{t('no_data')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <ProductFormDialog
          open={showForm}
          onClose={() => setShowForm(false)}
          product={editProduct}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['products'] })}
        />
      )}
    </div>
  );
}