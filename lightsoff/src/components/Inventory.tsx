import { useState, type FormEvent } from 'react'
import { useStore } from '../store'
import {
  adjustInventory, createProduct, createPurchaseOrder, createReceipt, createVendor,
} from '../api/mutations'
import {
  Badge, Button, Card, Field, FormPanel, Input, SectionTitle, Select, timeAgo,
} from './ui'
import { cartesianProduct } from '../lib/matrix'
import type { POLineItem } from '../types'

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
  const [productBrand, setProductBrand] = useState('')
  const [productDesc, setProductDesc] = useState('')
  const [productSku, setProductSku] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productCost, setProductCost] = useState('')
  const [productReorder, setProductReorder] = useState('0')
  const [opt1Name, setOpt1Name] = useState('Size')
  const [opt1Values, setOpt1Values] = useState('')
  const [opt2Name, setOpt2Name] = useState('Color')
  const [opt2Values, setOpt2Values] = useState('')
  const [poVendor, setPoVendor] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [poLines, setPoLines] = useState([{ productId: '', qty: '50', unitCost: '' }])
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
    const options = [
      opt1Name.trim() && opt1Values.trim() ? { name: opt1Name.trim(), values: opt1Values.split(',').map((s) => s.trim()).filter(Boolean) } : null,
      opt2Name.trim() && opt2Values.trim() ? { name: opt2Name.trim(), values: opt2Values.split(',').map((s) => s.trim()).filter(Boolean) } : null,
    ].filter(Boolean) as { name: string; values: string[] }[]
    await spineMutate(
      () => createProduct(auth!.token, auth!.tenantId, {
        title: productTitle.trim(),
        brand: productBrand.trim() || undefined,
        description: productDesc.trim() || undefined,
        baseSku: productSku.trim(),
        options,
        price,
        unitCost,
        reorderPoint,
      }),
      { type: 'ADD_PRODUCT', title: productTitle.trim(), sku: productSku.trim(), price, unitCost, reorderPoint },
    )
    setProductTitle('')
    setProductBrand('')
    setProductDesc('')
    setProductSku('')
    setOpt1Values('')
    setOpt2Values('')
  }

  async function onCreatePo(e: FormEvent) {
    e.preventDefault()
    const vendorId = poVendor || defaultVendor
    const lines: POLineItem[] = poLines
      .map((l) => ({
        productId: l.productId || defaultVariant,
        qty: Number(l.qty),
        unitCost: Number(l.unitCost) || productById(l.productId || defaultVariant)?.unitCost || 0,
      }))
      .filter((l) => l.productId && l.qty > 0)
    if (!vendorId || lines.length === 0) return
    const first = lines[0]
    await spineMutate(
      () => createPurchaseOrder(auth!.token, auth!.tenantId, {
        vendorId,
        lines,
        poNumber: poNumber || undefined,
        send: poSend,
      }),
      { type: 'CREATE_PO', vendorId, variantId: first.productId, qty: first.qty, unitCost: first.unitCost, send: poSend },
    )
  }

  async function onReceive(e: FormEvent) {
    e.preventDefault()
    const vendorId = rcvVendor || defaultVendor
    const qty = Number(rcvQty)
    if (!vendorId || !qty) return
    const isSample = rcvType === 'sample'
    const po = state.purchaseOrders.find((p) => p.id === rcvPo)
    const poLine = po?.lines[0]
    const variantId = rcvVariant || poLine?.productId || defaultVariant
    await spineMutate(
      () => createReceipt(auth!.token, auth!.tenantId, {
        vendorId,
        poId: rcvPo || undefined,
        type: rcvType,
        lines: isSample
          ? [{ description: 'Sample item', qty }]
          : [{ variantId, qty, poLineItemId: poLine?.id }],
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

          <form onSubmit={onAddProduct} className="lg:col-span-2">
            <FormPanel title="Add product (master + variant matrix)">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Product title">
                  <Input value={productTitle} onChange={(e) => setProductTitle(e.target.value)} placeholder="Blue Hoodie" required />
                </Field>
                <Field label="Brand">
                  <Input value={productBrand} onChange={(e) => setProductBrand(e.target.value)} placeholder="Acme" />
                </Field>
              </div>
              <Field label="Description">
                <Input value={productDesc} onChange={(e) => setProductDesc(e.target.value)} placeholder="Midweight fleece hoodie" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Base SKU">
                  <Input value={productSku} onChange={(e) => setProductSku(e.target.value)} placeholder="HOOD-BLU" required />
                </Field>
                <Field label="Reorder pt">
                  <Input type="number" value={productReorder} onChange={(e) => setProductReorder(e.target.value)} min={0} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Price (all variants)">
                  <Input type="number" step="0.01" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} />
                </Field>
                <Field label="Unit cost">
                  <Input type="number" step="0.01" value={productCost} onChange={(e) => setProductCost(e.target.value)} />
                </Field>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                <div className="mb-2 text-xs font-medium text-slate-500">Variant options (comma-separated values)</div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Option 1 name">
                    <Input value={opt1Name} onChange={(e) => setOpt1Name(e.target.value)} placeholder="Size" />
                  </Field>
                  <Field label="Values">
                    <Input value={opt1Values} onChange={(e) => setOpt1Values(e.target.value)} placeholder="S, M, L" />
                  </Field>
                  <Field label="Option 2 name">
                    <Input value={opt2Name} onChange={(e) => setOpt2Name(e.target.value)} placeholder="Color" />
                  </Field>
                  <Field label="Values">
                    <Input value={opt2Values} onChange={(e) => setOpt2Values(e.target.value)} placeholder="Blue, Black" />
                  </Field>
                </div>
                {(opt1Values || opt2Values) && (
                  <p className="mt-2 text-xs text-slate-500">
                    Will generate {cartesianProduct([
                      opt1Name.trim() && opt1Values.trim() ? { name: opt1Name.trim(), values: opt1Values.split(',').map((s) => s.trim()).filter(Boolean) } : { name: '_', values: [''] },
                      opt2Name.trim() && opt2Values.trim() ? { name: opt2Name.trim(), values: opt2Values.split(',').map((s) => s.trim()).filter(Boolean) } : { name: '__', values: [''] },
                    ].filter((o) => o.name !== '_' && o.name !== '__')).length || 1} SKU(s) from base {productSku || '…'}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full">Create product</Button>
            </FormPanel>
          </form>

          <form onSubmit={onCreatePo} className="lg:col-span-2">
            <FormPanel title="Create purchase order (header + lines)">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Vendor">
                  <Select value={poVendor || defaultVendor} onChange={(e) => setPoVendor(e.target.value)}>
                    {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </Select>
                </Field>
                <Field label="PO number">
                  <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-1042" />
                </Field>
              </div>
              <div className="space-y-2">
                {poLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_72px_88px_auto] gap-2 items-end">
                    <Field label={i === 0 ? 'Line — variant' : ''}>
                      <Select value={line.productId || defaultVariant} onChange={(e) => setPoLines((rows) => rows.map((r, j) => j === i ? { ...r, productId: e.target.value } : r))}>
                        {state.products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}
                      </Select>
                    </Field>
                    <Field label={i === 0 ? 'Qty' : ''}>
                      <Input type="number" value={line.qty} onChange={(e) => setPoLines((rows) => rows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))} min={1} />
                    </Field>
                    <Field label={i === 0 ? 'Unit cost' : ''}>
                      <Input type="number" step="0.01" value={line.unitCost} onChange={(e) => setPoLines((rows) => rows.map((r, j) => j === i ? { ...r, unitCost: e.target.value } : r))} placeholder="auto" />
                    </Field>
                    {poLines.length > 1 && (
                      <Button type="button" variant="ghost" onClick={() => setPoLines((rows) => rows.filter((_, j) => j !== i))}>×</Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="ghost" onClick={() => setPoLines((rows) => [...rows, { productId: defaultVariant, qty: '10', unitCost: '' }])}>+ line</Button>
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
                <span className="font-mono text-sm font-semibold">{po.poNumber ?? po.id.slice(0, 8) + '…'}</span>
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
                    <div key={l.id ?? l.productId} className="flex justify-between border-t border-slate-50 py-1 first:border-0">
                      <span>
                        {l.qty}× {p?.name ?? l.productId.slice(0, 8)}
                        {l.receivedQty != null && <span className="text-slate-400"> · received {l.receivedQty}/{l.qty}</span>}
                      </span>
                      <span className="text-slate-400">${(l.lineTotal ?? l.qty * l.unitCost).toFixed(2)}</span>
                    </div>
                  )
                })}
                {po.linkedBills && po.linkedBills.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    Linked bills: {po.linkedBills.map((b) => b.billNumber ?? b.id.slice(0, 8)).join(', ')}
                  </div>
                )}
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
