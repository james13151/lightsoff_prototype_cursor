import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { can } from '../lib/permissions'
import {
  connectShopify,
  fetchSalesOrders,
  fetchShopifyStatus,
  registerShopifyWebhooks,
  shipFulfillment,
  syncShopifyOrders,
  syncShopifyProducts,
  type SalesOrder,
  type ShopifyStatus,
} from '../api/shopify'
import {
  Badge, Button, Card, Field, Input, ListRow, SectionTitle, SubTabs,
} from './ui'

type Tab = 'connect' | 'orders'

export function ShopifyView() {
  const { auth, role, mode, dispatch } = useStore()
  const [tab, setTab] = useState<Tab>('connect')
  const [status, setStatus] = useState<ShopifyStatus | null>(null)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [shop, setShop] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [shipModal, setShipModal] = useState<SalesOrder | null>(null)
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')

  const canManage = can(role, 'credentials.manage')
  const isLive = mode === 'live' && auth?.token && auth.tenantId

  const refresh = useCallback(async () => {
    if (!isLive) return
    setError(null)
    try {
      const [st, ord] = await Promise.all([
        fetchShopifyStatus(auth.token, auth.tenantId),
        fetchSalesOrders(auth.token, auth.tenantId),
      ])
      setStatus(st)
      setOrders(ord)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [auth, isLive])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
      dispatch({ type: 'SET_TOAST', message: 'Shopify action completed' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!isLive) {
    return (
      <div className="max-w-2xl">
        <SectionTitle sub="Connect to the API in live mode to link Shopify and sync orders.">
          Shopify integration
        </SectionTitle>
        <Card className="p-5 text-sm text-ink-muted">
          Demo mode uses in-memory seed data. Sign in via Supabase and select a workspace to enable Shopify sync.
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <SectionTitle sub="Sync sales orders from Shopify into inventory, then push fulfillments back with tracking.">
        Shopify integration
      </SectionTitle>

      <SubTabs
        tabs={[
          { id: 'connect' as Tab, label: 'Connection' },
          { id: 'orders' as Tab, label: `Orders (${orders.length})` },
        ]}
        active={tab}
        onChange={setTab}
      />

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {tab === 'connect' && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-ink">Store connection</div>
                {status?.connected ? (
                  <p className="mt-1 text-sm text-ink-muted">
                    Connected to <span className="font-medium text-ink">{status.shop}</span>
                    {status.webhook_url && (
                      <> · Webhook: <code className="text-xs">{status.webhook_url}</code></>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-ink-muted">Not connected — add a custom app access token below.</p>
                )}
              </div>
              {status?.connected && <Badge tone="emerald">Connected</Badge>}
            </div>

            {canManage ? (
              <div className="mt-4 space-y-3">
                <Field label="Shop domain">
                  <Input
                    value={shop}
                    onChange={(e) => setShop(e.target.value)}
                    placeholder="your-brand.myshopify.com"
                  />
                </Field>
                <Field label="Admin API access token">
                  <Input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="shpat_…"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={busy || !shop.trim() || !accessToken.trim()}
                    onClick={() => void run(async () => {
                      await connectShopify(auth.token, auth.tenantId, { shop, access_token: accessToken })
                      setAccessToken('')
                    })}
                  >
                    Save connection
                  </Button>
                  {status?.connected && (
                    <>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void run(async () => { await registerShopifyWebhooks(auth.token, auth.tenantId) })}
                      >
                        Register webhooks
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void run(async () => { await syncShopifyProducts(auth.token, auth.tenantId) })}
                      >
                        Sync products
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-ink-faint">
                  Create a custom app in Shopify Admin → Settings → Apps → Develop apps.
                  Scopes needed: <code>read_orders</code>, <code>write_orders</code>, <code>read_products</code>, <code>read_inventory</code>.
                  Set <code>API_PUBLIC_URL</code> on the API host, then click Register webhooks.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">Admin role required to manage Shopify credentials.</p>
            )}
          </Card>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy || !status?.connected}
              onClick={() => void run(async () => { await syncShopifyOrders(auth.token, auth.tenantId) })}
            >
              Pull orders from Shopify
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>

          {orders.length === 0 ? (
            <Card className="p-6 text-center text-sm text-ink-muted">
              No orders yet. Connect Shopify and pull orders, or wait for webhooks.
            </Card>
          ) : (
            orders.map((order) => (
              <ListRow key={order.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-ink">{order.order_number ?? `#${order.shopify_order_id}`}</span>
                    <span className="ml-2 text-ink-muted">
                      {order.customer_name || order.customer_email || 'Guest'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="slate">{order.financial_status ?? 'unknown'}</Badge>
                    <Badge tone={order.fulfillment_status === 'fulfilled' ? 'emerald' : 'amber'}>
                      {order.fulfillment_status ?? 'unfulfilled'}
                    </Badge>
                    {order.sync_status === 'synced' && <Badge tone="emerald">Synced to Shopify</Badge>}
                    {order.sync_status === 'failed' && <Badge tone="rose">Sync failed</Badge>}
                    <span className="text-sm font-medium text-ink">
                      {order.currency} {order.total_price.toFixed(2)}
                    </span>
                  </div>
                </div>
                <ul className="text-xs text-ink-muted">
                  {order.lines.map((line) => (
                    <li key={line.id}>
                      {line.qty}× {line.title} {line.sku ? `(${line.sku})` : ''}
                      {!line.variant_id && <span className="text-amber-600"> · unmapped variant</span>}
                    </li>
                  ))}
                </ul>
                {order.fulfillment_id && order.ship_status !== 'shipped' && order.ship_status !== 'cancelled' && (
                  <Button className="mt-1 text-xs" onClick={() => {
                    setShipModal(order)
                    setCarrier('')
                    setTracking('')
                  }}>
                    Mark shipped & sync to Shopify
                  </Button>
                )}
                {order.tracking_number && (
                  <p className="text-xs text-ink-faint">
                    {order.carrier ?? 'Carrier'}: {order.tracking_number}
                  </p>
                )}
                {order.sync_error && (
                  <p className="text-xs text-rose-600">{order.sync_error}</p>
                )}
              </ListRow>
            ))
          )}
        </div>
      )}

      {shipModal?.fulfillment_id && (
        <Card className="fixed bottom-8 right-8 z-50 w-full max-w-sm border-accent/30 p-4 shadow-xl">
          <div className="text-sm font-semibold text-ink">
            Ship {shipModal.order_number ?? shipModal.shopify_order_id}
          </div>
          <div className="mt-3 space-y-2">
            <Field label="Carrier">
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="UPS, FedEx, USPS…" />
            </Field>
            <Field label="Tracking number">
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="1Z999…" />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              disabled={busy}
              onClick={() => void run(async () => {
                await shipFulfillment(auth.token, shipModal.fulfillment_id!, {
                  carrier: carrier || undefined,
                  tracking_number: tracking || undefined,
                  sync_to_shopify: true,
                })
                setShipModal(null)
              })}
            >
              Ship & sync
            </Button>
            <Button variant="ghost" onClick={() => setShipModal(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
