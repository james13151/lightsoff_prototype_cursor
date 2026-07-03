import { base44 } from '@/api/base44Client';

/**
 * Recomputes the InventoryStock quantity for a given product+warehouse
 * by summing all InboundRecords (+), OutboundRecords (-), and StockAdjustments (after_qty - before_qty).
 * Then writes the result back to InventoryStock.
 */
export async function syncStockForProduct(skuRef, warehouse) {
  if (!skuRef || !warehouse) return;

  const [inbounds, outbounds, adjustments, stocks] = await Promise.all([
    base44.entities.InboundRecord.filter({ sku_ref: skuRef, warehouse }),
    base44.entities.OutboundRecord.filter({ sku_ref: skuRef, warehouse }),
    base44.entities.StockAdjustment.filter({ sku_ref: skuRef }),
    base44.entities.InventoryStock.filter({ sku_ref: skuRef, warehouse }),
  ]);

  const inboundQty = inbounds.reduce((s, r) => s + (r.quantity || 0), 0);
  const outboundQty = outbounds.reduce((s, r) => s + (r.quantity || 0), 0);
  // StockAdjustment: difference = after_qty - before_qty (can be +/-)
  const adjustQty = adjustments.reduce((s, r) => s + ((r.after_qty || 0) - (r.before_qty || 0)), 0);

  const computed = inboundQty - outboundQty + adjustQty;
  const finalQty = Math.max(0, computed);

  const existing = stocks[0];
  if (existing) {
    await base44.entities.InventoryStock.update(existing.id, { quantity: finalQty });
  } else {
    // Fetch product info for sku_id/sku_name
    const products = await base44.entities.Product.filter({ id: skuRef });
    const product = products[0];
    await base44.entities.InventoryStock.create({
      sku_ref: skuRef,
      sku_id: product?.sku_id || '',
      sku_name: product?.name || '',
      warehouse,
      quantity: finalQty,
    });
  }
}