import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const SHOPIFY_API_VERSION = '2024-01';

async function shopifyFetch(domain, token, path, method = 'GET', body = null) {
  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
  const opts = {
    method,
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Update tracking number on an OutboundRecord and push it to Shopify
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const domain = Deno.env.get('SHOPIFY_STORE_DOMAIN');
  const token = Deno.env.get('SHOPIFY_ADMIN_TOKEN');
  if (!domain || !token) {
    return Response.json({ error: 'Shopify credentials not configured' }, { status: 500 });
  }

  const { outbound_id, tracking_number, carrier } = await req.json();
  if (!outbound_id || !tracking_number) {
    return Response.json({ error: 'outbound_id and tracking_number required' }, { status: 400 });
  }

  // Load outbound record
  const outbounds = await base44.asServiceRole.entities.OutboundRecord.filter({ id: outbound_id });
  const outbound = outbounds[0];
  if (!outbound) return Response.json({ error: 'OutboundRecord not found' }, { status: 404 });

  // Update local outbound
  await base44.asServiceRole.entities.OutboundRecord.update(outbound_id, {
    tracking_number,
    carrier: carrier || outbound.carrier,
    fulfillment_status: '已发货',
  });

  // Update ShopifyOrderLine tracking if linked
  if (outbound.shopify_order_line_ref) {
    await base44.asServiceRole.entities.ShopifyOrderLine.update(outbound.shopify_order_line_ref, {
      tracking_number,
      carrier: carrier || '',
    });
  }

  // Push to Shopify if linked to a Shopify order
  let shopifyResult = 'skipped';
  if (outbound.shopify_order_ref) {
    const orders = await base44.asServiceRole.entities.ShopifyOrder.filter({ id: outbound.shopify_order_ref });
    const order = orders[0];
    if (order) {
      const lines = await base44.asServiceRole.entities.ShopifyOrderLine.filter({ id: outbound.shopify_order_line_ref });
      const line = lines[0];

      const locData = await shopifyFetch(domain, token, '/locations.json');
      const locationId = locData.locations?.[0]?.id;

      if (locationId && line) {
        const foData = await shopifyFetch(domain, token, `/orders/${order.shopify_order_id}/fulfillment_orders.json`);
        const fo = foData.fulfillment_orders?.find(f => f.status === 'open' || f.status === 'in_progress');
        if (fo) {
          const foLineItem = fo.line_items?.find(li => String(li.line_item_id) === String(line.shopify_line_item_id));
          if (foLineItem) {
            await shopifyFetch(domain, token, '/fulfillments.json', 'POST', {
              fulfillment: {
                location_id: locationId,
                tracking_number,
                tracking_company: carrier || '',
                notify_customer: true,
                line_items_by_fulfillment_order: [{
                  fulfillment_order_id: fo.id,
                  fulfillment_order_line_items: [{ id: foLineItem.id, quantity: outbound.quantity }],
                }],
              },
            });
            shopifyResult = 'pushed';
          }
        }
      }
    }
  }

  return Response.json({ success: true, shopify: shopifyResult });
});