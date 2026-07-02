import { useState, type FormEvent } from 'react'
import { useStore } from '../store'
import {
  adjustInventory, createProduct, createPurchaseOrder, createReceipt, createVendor,
} from '../api/mutations'
import {
  Badge, Button, Card, Field, FormPanel, Input, SectionTitle, Select, timeAgo,
} from './ui'

const PO_STATUS_TONE: Record<string, string> = {
  draft: 'slate', sent: 'sky', partially_received: 'amber', received: 'emerald', closed: 'slate',
}

export function Inventory() {
  const { state, spineMutate, auth } = useStore()
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? '—'
  const productById = (id: string | null) => state.products.find((p) => p.id === id)

  const [vendorNameInput, setVendorNameInput] = useState('')
  const [vendorLead, setVendorLead] = useState('14')
  const [productTitle, setProductTitle] = useState('')
  const [productSku, setProductSku] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productCost, setProductCost] = useState('')
  const [productReorder, setProductReorder] = useState('0')
  const [poVendor, setPoVendor] = useState('')
  const [poVariant, setPoVariant] = useState('')
  const [poQty, setPoQty] = useState('50')
  const [poCost, setPoCost] = useState('')
  const [poSend, setPoSend] = useState(true)
  const [rcvVendor, setRcvVendor] = useState('')
  const [rcvPo, setRcvPo] = useState('')
  const [rcvVariant, setRcvVariant] = useState('')
  const [rcvQty, setRcvQty] = useState('10')
  const [rcvType, setRcvType] = useState<'commercial' | 'sample'>('commercial')
  const [adjVariant, setAdjVariant] = useState('')
  const [adjQty, setAdjQty] = useState('')
  const [adjMemo, setAdjMemo] = useState('')

  const defaultVendor = state.vendors[0]?.id ?? ''
  const defaultVariant = state.products[0]?.id ?? ''

  async function onAddVendor(e: FormEvent) {
    e.preventDefault()
    if (!vendorNameInput.trim()) return
    const lead = Number(vendorLead) || 14
    await spineMutate(
      () => createVendor(auth!.token, auth!.tenantId, { name: vendorNameInput.trim(), leadTimeDays: lead }),
      { type: 'ADD_VENDOR', name: vendorNameInput.trim(), leadTimeDays: lead },
    )
    setVendorNameInput('')
  }

  async function onAddProduct(e: FormEvent) {
    e.preventDefault()
    if (!productTitle.trim() || !productSku.trim()) return
    const price = Number(productPrice) || 0
    const unitCost = Number(productCost) || 0
    const reorderPoint = Number(productReorder) || 0
    await spineMutate(
      () => createProduct(auth!.token, auth!.tenantId, {
        title: productTitle.trim(),
        sku: productSku.trim(),
        price,
        unitCost,
        reorderPoint,
      }),
      { type: 'ADD_PRODUCT', title: productTitle.trim(), sku: productSku.trim(), price, unitCost, reorderPoint },
    )
    setProductTitle('')
    setProductSku('')
    setProductPrice('')
    setProductCost('')
  }

  async function onCreatePo(e: FormEvent) {
    e.preventDefault()
    const vendorId = poVendor || defaultVendor
    const variantId = poVariant || defaultVariant
    const qty = Number(poQty)
    const unitCost = Number(poCost) || productById(variantId)?.unitCost || 0
    if (!vendorId || !variantId || !qty) return
    await spineMutate(
      () => createPurchaseOrder(auth!.token, auth!.tenantId, {
        vendorId,
        lines: [{ variantId, qty, unitCost }],
        send: poSend,
      }),
      { type: 'CREATE_PO', vendorId, variantId, qty, unitCost, send: poSend },
    )
  }

  async function onReceive(e: FormEvent) {
    e.preventDefault()
    const vendorId = rcvVendor || defaultVendor
    const variantId = rcvVariant || defaultVariant
    const qty = Number(rcvQty)
    if (!vendorId || !qty) return
    const isSample = rcvType === 'sample'
    await spineMutate(
      () => createReceipt(auth!.token, auth!.tenantId, {
        vendorId,
        poId: rcvPo || undefined,
        type: rcvType,
        lines: isSample
          ? [{ description: 'Sample item', qty }]
          : [{ variantId, qty }],
      }),
      {
        type: 'CREATE_RECEIPT',
        vendorId,
        poId: rcvPo || undefined,
        variantId: isSample ? '' : variantId,
        qty,
        receiptType: rcvType,
        description: isSample ? 'Sample item' : undefined,
      },
    )
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault()
    const variantId = adjVariant || defaultVariant
    const qtyDelta = Number(adjQty)
    if (!variantId || !qtyDelta) return
    await spineMutate(
      () => adjustInventory(auth!.token, auth!.tenantId, { variantId, qtyDelta, memo: adjMemo || undefined }),
      { type: 'ADJUST_STOCK', variantId, qtyDelta, memo: adjMemo || undefined },
    )
    setAdjQty('')
    setAdjMemo('')
  }

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle sub="Add master data and record inventory transactions. In live mode these write to Postgres; in demo mode they update the in-memory store.">
          Quick actions
        </SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <form onSubmit={onAddVendor}>
            <FormPanel title="Add vendor">
              <Field label="Name">
                <Input value={vendorNameInput} onChange={(e) => setVendorNameInput(e.target.value)} placeholder="Acme Textiles" required />
              </Field>
              <Field label="Lead time (days)">
                <Input type="number" value={vendorLead} onChange={(e) => setVendorLead(e.target.value)} min={1} />
              </Field>
              <Button type="submit" className="w-full">Create vendor</Button>
            </FormPanel>
          </form>

          <form onSubmit={onAddProduct}>
            <FormPanel title="Add product">
              <Field label="Product title">
                <Input value={productTitle} onChange={(e) => setProductTitle(e.target.value)} placeholder="Blue Hoodie" required />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="SKU">
                  <Input value={productSku} onChange={(e) => setProductSku(e.target.value)} placeholder="HOOD-BLU-M" required />
                </Field>
                <Field label="Reorder pt">
                  <Input type="number" value={productReorder} onChange={(e) => setProductReorder(e.target.value)} min={0} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Price">
                  <Input type="number" step="0.01" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="68" />
                </Field>
                <Field label="Unit cost">
                  <Input type="number" step="0.01" value={productCost} onChange={(e) => setProductCost(e.target.value)} placeholder="18.50" />
                </Field>
              </div>
              <Button type="submit" className="w-full">Create product</Button>
            </FormPanel>
          </form>

          <form onSubmit={onCreatePo}>
            <FormPanel title="Create purchase order">
              <Field label="Vendor">
                <Select value={poVendor || defaultVendor} onChange={(e) => setPoVendor(e.target.value)}>
                  {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <Field label="Product / variant">
                <Select value={poVariant || defaultVariant} onChange={(e) => setPoVariant(e.target.value)}>
                  {state.products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Qty">
                  <Input type="number" value={poQty} onChange={(e) => setPoQty(e.target.value)} min={1} required />
                </Field>
                <Field label="Unit cost">
                  <Input type="number" step="0.01" value={poCost} onChange={(e) => setPoCost(e.target.value)} placeholder="auto" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={poSend} onChange={(e) => setPoSend(e.target.checked)} />
                Send PO immediately
              </label>
              <Button type="submit" className="w-full">Create PO</Button>
            </FormPanel>
          </form>

          <form onSubmit={onReceive}>
            <FormPanel title="Receive goods">
              <Field label="Vendor">
                <Select value={rcvVendor || defaultVendor} onChange={(e) => setRcvVendor(e.target.value)}>
                  {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <Field label="Type">
                <Select value={rcvType} onChange={(e) => setRcvType(e.target.value as 'commercial' | 'sample')}>
                  <option value="commercial">Commercial (adds stock)</option>
                  <option value="sample">Sample (no stock)</option>
                </Select>
              </Field>
              <Field label="PO (optional)">
                <Select value={rcvPo} onChange={(e) => setRcvPo(e.target.value)}>
                  <option value="">— none —</option>
                  {state.purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>{po.id.slice(0, 8)}… ({po.status})</option>
                  ))}
                </Select>
              </Field>
              {rcvType === 'commercial' && (
                <Field label="Product">
                  <Select value={rcvVariant || defaultVariant} onChange={(e) => setRcvVariant(e.target.value)}>
                    {state.products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Qty received">
                <Input type="number" value={rcvQty} onChange={(e) => setRcvQty(e.target.value)} min={1} required />
              </Field>
              <Button type="submit" className="w-full">Record receipt</Button>
            </FormPanel>
          </form>

          <form onSubmit={onAdjust}>
            <FormPanel title="Adjust stock">
              <Field label="Product">
                <Select value={adjVariant || defaultVariant} onChange={(e) => setAdjVariant(e.target.value)}>
                  {state.products.map((p) => <option key={p.id} value={p.id}>{p.sku} (on hand: {p.stock})</option>)}
                </Select>
              </Field>
              <Field label="Qty change (+/-)">
                <Input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} placeholder="-3 or +10" required />
              </Field>
              <Field label="Memo">
                <Input value={adjMemo} onChange={(e) => setAdjMemo(e.target.value)} placeholder="Cycle count correction" />
              </Field>
              <Button type="submit" className="w-full">Post adjustment</Button>
            </FormPanel>
          </form>
        </div>
      </div>

      <div>
        <SectionTitle sub="LightsOff is the system of record for stock — every movement below is pushed to Shopify, not pulled from it.">
          Stock levels
        </SectionTitle>
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium text-right">On hand</th>
                <th className="px-4 py-2.5 font-medium text-right">Reorder pt</th>
                <th className="px-4 py-2.5 font-medium text-right">Velocity/day</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.products.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No products yet — add one above.</td></tr>
              ) : state.products.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.sku}</td>
                  <td className="px-4 py-2.5">{p.name}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${p.stock === 0 ? 'text-rose-600' : p.stock <= p.reorderPoint ? 'text-amber-600' : ''}`}>
                    {p.stock}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{p.reorderPoint}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{p.salesVelocityPerDay}</td>
                  <td className="px-4 py-2.5">
                    {p.stock === 0 ? (
                      <Badge tone="rose">out of stock</Badge>
                    ) : p.stock <= p.reorderPoint ? (
                      <Badge tone="amber">below reorder point</Badge>
                    ) : (
                      <Badge tone="emerald">healthy</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <SectionTitle sub="POs drafted by AI capture or AI reorder suggestions carry their origin — nothing enters the system untagged.">
          Purchase orders
        </SectionTitle>
        <div className="space-y-2.5">
          {state.purchaseOrders.length === 0 ? (
            <Card className="p-4 text-sm text-slate-400">No purchase orders yet.</Card>
          ) : state.purchaseOrders.map((po) => (
            <Card key={po.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{po.id.slice(0, 8)}…</span>
                <Badge tone={PO_STATUS_TONE[po.status]}>{po.status.replace(/_/g, ' ')}</Badge>
                <Badge tone={po.source === 'manual' ? 'slate' : 'indigo'}>
                  {po.source === 'ai_capture' ? '✦ from AI capture' : po.source === 'ai_reorder' ? '✦ AI reorder suggestion' : 'manual'}
                </Badge>
                <span className="ml-auto text-xs text-slate-400">{vendorName(po.vendorId)} · {timeAgo(po.createdAt)}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {po.lines.map((l) => {
                  const p = productById(l.productId)
                  return (
                    <div key={l.productId} className="flex justify-between border-t border-slate-50 py-1 first:border-0">
                      <span>{l.qty}× {p?.name ?? l.productId.slice(0, 8)}</span>
                      <span className="text-slate-400">${(l.qty * l.unitCost).toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle sub="Receipts of type=sample skip commercial stock and auto-create R&D cards. Discrepancies vs the PO are flagged, never silently accepted.">
          Receipts
        </SectionTitle>
        <div className="space-y-2.5">
          {state.receipts.length === 0 ? (
            <Card className="p-4 text-sm text-slate-400">No receipts yet.</Card>
          ) : state.receipts.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{r.id.slice(0, 8)}…</span>
                <Badge tone={r.type === 'sample' ? 'indigo' : 'sky'}>{r.type}</Badge>
                {r.poId && <Badge>matched to {r.poId.slice(0, 8)}…</Badge>}
                <span className="ml-auto text-xs text-slate-400">{vendorName(r.vendorId)} · {timeAgo(r.createdAt)}</span>
              </div>
              <div className="mt-1.5 text-sm text-slate-600">
                {r.lines.map((l, i) => (
                  <div key={i}>+{l.qty} — {l.description}</div>
                ))}
              </div>
              {r.discrepancy && (
                <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  ⚠ {r.discrepancy}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle sub="Append-only source of truth for stock. Shopify sales flow in via webhook; everything else originates here and is pushed out.">
          Inventory ledger
        </SectionTitle>
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium text-right">Δ qty</th>
                <th className="px-4 py-2.5 font-medium">Reason</th>
                <th className="px-4 py-2.5 font-medium">Reference</th>
                <th className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {state.ledger.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No ledger entries yet.</td></tr>
              ) : state.ledger.map((e) => {
                const p = productById(e.productId)
                return (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p?.sku ?? e.productId.slice(0, 8)}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${e.qtyDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {e.qtyDelta > 0 ? `+${e.qtyDelta}` : e.qtyDelta}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{e.reason.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{e.refId.slice(0, 8)}…</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{timeAgo(e.at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
