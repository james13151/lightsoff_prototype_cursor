// Generated from base44/functions/syncShopifyOrders/entry.ts. Do not edit directly.


// base44/functions/syncShopifyOrders/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
var SHOPIFY_API_VERSION = "2024-01";
async function shopifyFetch(domain, token, path) {
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return res.json();
}
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const domain = Deno.env.get("SHOPIFY_STORE_DOMAIN");
  const token = Deno.env.get("SHOPIFY_ADMIN_TOKEN");
  if (!domain || !token) {
    return Response.json({ error: "Shopify credentials not configured" }, { status: 500 });
  }
  const body = await req.json().catch(() => ({}));
  const status = body.status || "any";
  const limit = body.limit || 50;
  const sinceId = body.since_id || null;
  let path = `/orders.json?status=${status}&limit=${limit}&order=created_at+desc`;
  if (sinceId) path += `&since_id=${sinceId}`;
  const data = await shopifyFetch(domain, token, path);
  const shopifyOrders = data.orders || [];
  let created = 0;
  let updated = 0;
  for (const so of shopifyOrders) {
    const existing = await base44.asServiceRole.entities.ShopifyOrder.filter({ shopify_order_id: String(so.id) });
    const shippingAddr = so.shipping_address ? [so.shipping_address.address1, so.shipping_address.city, so.shipping_address.province, so.shipping_address.country].filter(Boolean).join(", ") : "";
    const orderPayload = {
      shopify_order_id: String(so.id),
      order_number: so.name,
      shopify_created_at: so.created_at,
      customer_name: so.customer ? `${so.customer.first_name || ""} ${so.customer.last_name || ""}`.trim() : so.billing_address?.name || "",
      customer_email: so.email || "",
      shipping_address: shippingAddr,
      total_price: parseFloat(so.total_price) || 0,
      currency: so.currency || "USD",
      financial_status: so.financial_status || "",
      fulfillment_status: so.fulfillment_status || "unfulfilled",
      tags: so.tags || "",
      notes: so.note || "",
      last_synced_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    let localOrderId;
    if (existing.length > 0) {
      await base44.asServiceRole.entities.ShopifyOrder.update(existing[0].id, orderPayload);
      localOrderId = existing[0].id;
      updated++;
    } else {
      const created_order = await base44.asServiceRole.entities.ShopifyOrder.create(orderPayload);
      localOrderId = created_order.id;
      created++;
    }
    for (const li of so.line_items || []) {
      const existingLine = await base44.asServiceRole.entities.ShopifyOrderLine.filter({
        shopify_order_ref: localOrderId,
        shopify_line_item_id: String(li.id)
      });
      let fulfilledQty = 0;
      for (const f of so.fulfillments || []) {
        for (const fli of f.line_items || []) {
          if (String(fli.id) === String(li.id)) {
            fulfilledQty += fli.quantity || 0;
          }
        }
      }
      const lineStatus = fulfilledQty === 0 ? "unfulfilled" : fulfilledQty >= (li.quantity || 0) ? "fulfilled" : "partial";
      let trackingNumber = "";
      let carrier = "";
      for (const f of so.fulfillments || []) {
        for (const fli of f.line_items || []) {
          if (String(fli.id) === String(li.id) && f.tracking_number) {
            trackingNumber = f.tracking_number;
            carrier = f.tracking_company || "";
          }
        }
      }
      const linePayload = {
        shopify_order_ref: localOrderId,
        shopify_order_number: so.name,
        shopify_line_item_id: String(li.id),
        shopify_sku: li.sku || "",
        product_name: li.name || li.title || "",
        variant_title: li.variant_title || "",
        quantity_ordered: li.quantity || 0,
        quantity_fulfilled: fulfilledQty,
        unit_price: parseFloat(li.price) || 0,
        line_total: (parseFloat(li.price) || 0) * (li.quantity || 0),
        fulfillment_status: lineStatus,
        tracking_number: trackingNumber,
        carrier
      };
      if (existingLine.length > 0) {
        await base44.asServiceRole.entities.ShopifyOrderLine.update(existingLine[0].id, linePayload);
      } else {
        await base44.asServiceRole.entities.ShopifyOrderLine.create(linePayload);
      }
    }
  }
  return Response.json({
    success: true,
    orders_synced: shopifyOrders.length,
    created,
    updated
  });
});
