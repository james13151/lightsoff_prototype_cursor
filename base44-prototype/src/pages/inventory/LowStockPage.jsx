import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import CreatePODialog from '@/components/purchasing/CreatePODialog';
import { canSeeShanghai, isPartner } from '@/lib/permissions';
import { useI18n } from '@/lib/i18nContext';

function LowStockTable({ rows, currentUser, onInitiatePO, showShanghai, t }) {
  if (rows.length === 0) {
    return <div className="text-center py-8 text-muted-foreground text-[13px]">{t('no_data')}</div>;
  }
  return (
    <div className="rounded-xl border border-thin border-border overflow-hidden mb-6">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-thin border-border bg-muted/30">
            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_sku')}</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_name')}</th>
            {showShanghai && <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('warehouse_shanghai')}</th>}
            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('warehouse_tucson')}</th>
            {showShanghai && <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_total')}</th>}
            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_safety')}</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_gap')}</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('inv_actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.product.id + (r.warehouse || '')} className="border-b border-thin border-border hover:bg-white/[0.03]">
              <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{r.product.sku_id || '-'}</td>
              <td className="px-4 py-2.5 font-medium text-foreground">
                {r.product.name}
                {r.warehouse && <span className="ml-2 text-[10px] text-muted-foreground">({r.warehouse})</span>}
              </td>
              {showShanghai && <td className="px-4 py-2.5 font-semibold text-foreground">{r.shanghaiQty ?? '-'}</td>}
              <td className="px-4 py-2.5 font-semibold text-foreground">{r.tucsonQty ?? '-'}</td>
              {showShanghai && <td className="px-4 py-2.5 font-semibold text-primary">{r.totalQty}</td>}
              <td className="px-4 py-2.5 text-muted-foreground">{r.product.safety_stock ?? 0}</td>
              <td className="px-4 py-2.5 text-red-400 font-medium">-{r.gap}</td>
              <td className="px-4 py-2.5">
                <Button size="sm" className="h-6 text-[11px] px-2" onClick={() => onInitiatePO(r.product)}>
                  {t('action_initiate_po')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LowStockPage({ currentUser }) {
  const { t } = useI18n();
  const [showPODialog, setShowPODialog] = useState(false);
  const [prefillProduct, setPrefillProduct] = useState(null);
  const showShanghai = canSeeShanghai(currentUser);
  const userIsPartner = isPartner(currentUser);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
  });

  const { data: stocks = [] } = useQuery({
    queryKey: ['inventory_stocks'],
    queryFn: () => base44.entities.InventoryStock.list('-created_date', 1000),
  });

  const stockMap = useMemo(() => {
    const map = {};
    for (const s of stocks) {
      if (!map[s.sku_ref]) map[s.sku_ref] = { shanghai: null, tucson: null };
      if (s.warehouse === '上海仓') map[s.sku_ref].shanghai = s;
      if (s.warehouse === 'Tucson仓') map[s.sku_ref].tucson = s;
    }
    return map;
  }, [stocks]);

  // Section 1: per-warehouse alerts (either warehouse < safety)
  const perWarehouseAlerts = useMemo(() => {
    const rows = [];
    for (const p of products) {
      const sk = stockMap[p.id] || {};
      const shanghaiQty = sk.shanghai?.quantity ?? 0;
      const tucsonQty = sk.tucson?.quantity ?? 0;
      if (showShanghai && shanghaiQty < (p.safety_stock ?? 0)) {
        rows.push({ product: p, warehouse: '上海仓', shanghaiQty, tucsonQty, totalQty: shanghaiQty + tucsonQty, gap: (p.safety_stock ?? 0) - shanghaiQty });
      }
      if (tucsonQty < (p.safety_stock ?? 0)) {
        rows.push({ product: p, warehouse: 'Tucson仓', shanghaiQty, tucsonQty, totalQty: shanghaiQty + tucsonQty, gap: (p.safety_stock ?? 0) - tucsonQty });
      }
    }
    return rows;
  }, [products, stockMap, showShanghai]);

  // Section 2: total alerts (total < safety)
  const totalAlerts = useMemo(() => {
    return products
      .map(p => {
        const sk = stockMap[p.id] || {};
        const shanghaiQty = sk.shanghai?.quantity ?? 0;
        const tucsonQty = sk.tucson?.quantity ?? 0;
        const totalQty = showShanghai ? shanghaiQty + tucsonQty : tucsonQty;
        return { product: p, shanghaiQty, tucsonQty, totalQty, gap: (p.safety_stock ?? 0) - totalQty };
      })
      .filter(r => r.totalQty < (r.product.safety_stock ?? 0));
  }, [products, stockMap, showShanghai]);

  const handleInitiatePO = (product) => {
    setPrefillProduct(product);
    setShowPODialog(true);
  };

  const totalAlertsCount = userIsPartner ? perWarehouseAlerts.length : perWarehouseAlerts.length + totalAlerts.length;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="flex items-center gap-2 mb-6">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <h1 className="text-[18px] font-semibold text-foreground">{t('nav_low_stock')}</h1>
        <span className="text-[12px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-md font-medium">{totalAlertsCount} {t('low_stock_items')}</span>
      </div>

      {/* Section 1: Per-warehouse */}
      <h2 className="text-[13px] font-semibold text-foreground mb-3">{t('low_stock_per_warehouse')}</h2>
      <LowStockTable rows={perWarehouseAlerts} currentUser={currentUser} onInitiatePO={handleInitiatePO} showShanghai={showShanghai} t={t} />

      {/* Section 2: Total — only if not partner */}
      {!userIsPartner && (
        <>
          <h2 className="text-[13px] font-semibold text-foreground mb-3">{t('low_stock_total')}</h2>
          <LowStockTable rows={totalAlerts} currentUser={currentUser} onInitiatePO={handleInitiatePO} showShanghai={showShanghai} t={t} />
        </>
      )}

      <CreatePODialog
        open={showPODialog}
        onClose={() => setShowPODialog(false)}
        currentUser={currentUser}
        prefillProduct={prefillProduct}
      />
    </div>
  );
}