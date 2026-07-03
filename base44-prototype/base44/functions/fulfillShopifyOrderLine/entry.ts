import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHOPIFY_API_VERSION = '2024-01';

async function shopifyFetch(domain, token, path, method = 'GET', body = null) {
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const opts = {
    method,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const domain = Deno.env.get('SHOPIFY_STORE_DOMAIN');
  const token = Deno.env.get('SHOPIFY_ADMIN_TOKEN');
  if (!domain || !token) {
    return Response.json({ error: 'Shopify credentials not configured' }, { status: 500 });
  }

  const {
    shopify_order_ref,       // local ShopifyOrder ID
    shopify_order_line_ref,  // local ShopifyOrderLine ID
    sku_ref,                 // local Product ID
    quantity,
    warehouse,
    carrier,
    tracking_number,
    notes,
    recipient_name,
    recipient_address,
    recipient_contact,
  } = await req.json();

  if (!shopify_order_ref || !shopify_order_line_ref || !sku_ref || !quantity || !warehouse) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // 1. Load the ShopifyOrder to get the Shopify order ID
  const orders = await base44.asServiceRole.entities.ShopifyOrder.filter({ id: shopify_order_ref });
  const order = orders[0];
  if (!order) return Response.json({ error: 'ShopifyOrder not found' }, { status: 404 });

  // 2. Load the order line
  const lines = await base44.asServiceRole.entities.ShopifyOrderLine.filter({ id: shopify_order_line_ref });
  const line = lines[0];
  if (!line) return Response.json({ error: 'ShopifyOrderLine not found' }, { status: 404 });

  // 3. Create local OutboundRecord (linked to inventory)
  const today = new Date().toISOString().split('T')[0];
  const outbound = await base44.asServiceRole.entities.OutboundRecord.create({
    date: today,
    sku_ref,
    sku_name: line.product_name,
    quantity,
    type: '销售出库',
    warehouse,
    operator_id: user.id,
    operator_name: user.full_name,
    order_number: order.order_number,
    shopify_order_ref,
    shopify_order_line_ref,
    recipient_name: recipient_name || order.customer_name,
    recipient_address: recipient_address || order.shipping_address,
    recipient_contact: recipient_contact || order.customer_email,
    carrier: carrier || '',
    tracking_number: tracking_number || '',
    fulfillment_status: tracking_number ? '已发货' : '待出库',
    notes: notes || '',
  });

  // 4. Update inventory via syncStockForProduct logic (recompute)
  const [inbounds, outbounds, adjustments, stocks] = await Promise.all([
    base44.asServiceRole.entities.InboundRecord.filter({ sku_ref, warehouse }),
    base44.asServiceRole.entities.OutboundRecord.filter({ sku_ref, warehouse }),
    base44.asServiceRole.entities.StockAdjustment.filter({ sku_ref }),
    base44.asServiceRole.entities.InventoryStock.filter({ sku_ref, warehouse }),
  ]);
  const inboundQty = inbounds.reduce((s, r) => s + (r.quantity || 0), 0);
  const outboundQty = outbounds.reduce((s, r) => s + (r.quantity || 0), 0);
  const adjustQty = adjustments.reduce((s, r) => s + ((r.after_qty || 0) - (r.before_qty || 0)), 0);
  const finalQty = Math.max(0, inboundQty - outboundQty + adjustQty);

  const existingStock = stocks[0];
  if (existingStock) {
    await base44.asServiceRole.entities.InventoryStock.update(existingStock.id, { quantity: finalQty });
  } else {
    const products = await base44.asServiceRole.entities.Product.filter({ id: sku_ref });
    const product = products[0];
    await base44.asServiceRole.entities.InventoryStock.create({
      sku_ref, warehouse, quantity: finalQty,
      sku_id: product?.sku_id || '',
      sku_name: product?.name || '',
    });
  }

  // 5. Update ShopifyOrderLine: quantity_fulfilled, status, tracking
  const newFulfilledQty = (line.quantity_fulfilled || 0) + quantity;
  const newLineStatus = newFulfilledQty >= line.quantity_ordered ? 'fulfilled'
    : newFulfilledQty > 0 ? 'partial'
    : 'unfulfilled';

  await base44.asServiceRole.entities.ShopifyOrderLine.update(shopify_order_line_ref, {
    quantity_fulfilled: newFulfilledQty,
    fulfillment_status: newLineStatus,
    tracking_number: tracking_number || line.tracking_number,
    carrier: carrier || line.carrier,
  });

  // 6. Recompute overall ShopifyOrder fulfillment_status from all lines
  const allLines = await base44.asServiceRole.entities.ShopifyOrderLine.filter({ shopify_order_ref });
  const allFulfilled = allLines.every(l => l.id === shopify_order_line_ref ? newLineStatus === 'fulfilled' : l.fulfillment_status === 'fulfilled');
  const anyFulfilled = allLines.some(l => l.id === shopify_order_line_ref ? newFulfilledQty > 0 : l.quantity_fulfilled > 0);
  const orderStatus = allFulfilled ? 'fulfilled' : anyFulfilled ? 'partial' : 'unfulfilled';

  await base44.asServiceRole.entities.ShopifyOrder.update(shopify_order_ref, {
    fulfillment_status: orderStatus,
    last_synced_at: new Date().toISOString(),
  });

  // 7. Push fulfillment to Shopify if tracking number provided
  let shopifyFulfillmentResult = null;
  if (tracking_number) {
    // Get location ID first
    const locData = await shopifyFetch(domain, token, '/locations.json');
    const locationId = locData.locations?.[0]?.id;

    if (locationId) {
      const fulfillmentPayload = {
        fulfillment: {
          location_id: locationId,
          tracking_number,
          tracking_company: carrier || '',
          notify_customer: true,
          line_items_by_fulfillment_order: [],
        },
      };

      // Get fulfillment orders for this Shopify order
      const foData = await shopifyFetch(domain, token, `/orders/${order.shopify_order_id}/fulfillment_orders.json`);
      const fo = foData.fulfillment_orders?.find(f => f.status === 'open');
      if (fo) {
        const foLineItem = fo.line_items?.find(li => String(li.line_item_id) === String(line.shopify_line_item_id));
        if (foLineItem) {
          fulfillmentPayload.fulfillment.line_items_by_fulfillment_order = [{
            fulfillment_order_id: fo.id,
            fulfillment_order_line_items: [{ id: foLineItem.id, quantity }],
          }];
          shopifyFulfillmentResult = await shopifyFetch(domain, token, '/fulfillments.json', 'POST', fulfillmentPayload);
        }
      }
    }
  }

  return Response.json({
    success: true,
    outbound_id: outbound.id,
    order_status: orderStatus,
    line_status: newLineStatus,
    shopify_fulfillment: shopifyFulfillmentResult ? 'pushed' : 'skipped (no tracking number)',
  });
});