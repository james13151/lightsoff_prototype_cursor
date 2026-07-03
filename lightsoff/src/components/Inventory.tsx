import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import {
  adjustInventory, createProduct, createPurchaseOrder, createReceipt, createVendor, createWarehouse,
  updateProduct, updateVariant, updateVendor, updateWarehouse,
} from '../api/mutations'
import { useListFilter } from '../lib/useListFilter'
import {
  Badge, Button, Card, Field, FormPanel, Input, ListRow, ListToolbar,
  Modal, SectionTitle, Select, SubTabs, TextArea, timeAgo,
} from './ui'
import { cartesianProduct, variantSku, variantTitle } from '../lib/matrix'
import type { LocationAddress, POLineItem } from '../types'

const PO_STATUS_TONE: Record<string, string> = {
  draft: 'slate', sent: 'sky', partially_received: 'amber', received: 'emerald', closed: 'slate',
}

type InvTab = 'stock' | 'master' | 'purchase_orders' | 'receipts' | 'adjustments' | 'ledger' | 'warehouses'

const INV_TABS: { id: InvTab; label: string }[] = [
  { id: 'stock', label: 'Stock' },
  { id: 'master', label: 'Master data' },
  { id: 'purchase_orders', label: 'Purchase orders' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'adjustments', label: 'Adjustments' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'warehouses', label: 'Locations' },
]

type InvModal =
  | { kind: 'vendor'; id?: string }
  | { kind: 'product'; id?: string }
  | { kind: 'warehouse'; id?: string }
  | { kind: 'po' }
  | { kind: 'receipt' }
  | { kind: 'adjustment' }
  | null

export function Inventory() {
  const { state, spineMutate, auth } = useStore()
  const [tab, setTab] = useState<InvTab>('stock')
  const [modal, setModal] = useState<InvModal>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editVariants, setEditVariants] = useState<{ id: string; sku: string; price: string; unitCost: string; reorderPoint: string; title?: string }[]>([])
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? '—'
  const productById = (id: string | null) => state.products.find((p) => p.id === id)

  const defaultWarehouse = state.warehouses.find((w) => w.isDefault) ?? state.warehouses[0]
  const defaultVendor = state.vendors[0]?.id ?? ''
  const defaultVariant = state.products[0]?.id ?? ''

  const [stockWarehouseFilter, setStockWarehouseFilter] = useState('')

  const [vendorNameInput, setVendorNameInput] = useState('')
  const [vendorLead, setVendorLead] = useState('14')
  const [vendorEmail, setVendorEmail] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [vendorPaymentTerms, setVendorPaymentTerms] = useState('Net 30')
  const [vendorNotes, setVendorNotes] = useState('')
  const [vendorRecurring, setVendorRecurring] = useState(true)
  const [productTitle, setProductTitle] = useState('')
  const [productBrand, setProductBrand] = useState('')
  const [productDesc, setProductDesc] = useState('')
  const [productSku, setProductSku] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productCost, setProductCost] = useState('')
  const [productReorder, setProductReorder] = useState('0')
  const [opt1Name] = useState('Size')
  const [opt1Values, setOpt1Values] = useState('')
  const [opt2Name] = useState('Color')
  const [opt2Values, setOpt2Values] = useState('')
  const [poVendor, setPoVendor] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [poLines, setPoLines] = useState([{ productId: '', qty: '50', unitCost: '' }])
  const [poSend, setPoSend] = useState(true)
  const [rcvVendor, setRcvVendor] = useState('')
  const [rcvPo, setRcvPo] = useState('')
  const [rcvWarehouse, setRcvWarehouse] = useState('')
  const [rcvVariant, setRcvVariant] = useState('')
  const [rcvQty, setRcvQty] = useState('10')
  const [rcvType, setRcvType] = useState<'commercial' | 'sample'>('commercial')
  const [adjVariant, setAdjVariant] = useState('')
  const [adjWarehouse, setAdjWarehouse] = useState('')
  const [adjQty, setAdjQty] = useState('')
  const [adjMemo, setAdjMemo] = useState('')
  const [whCode, setWhCode] = useState('')
  const [whName, setWhName] = useState('')
  const [whDefault, setWhDefault] = useState(false)
  const [whContactName, setWhContactName] = useState('')
  const [whContactEmail, setWhContactEmail] = useState('')
  const [whContactPhone, setWhContactPhone] = useState('')
  const [whAddrLine1, setWhAddrLine1] = useState('')
  const [whAddrLine2, setWhAddrLine2] = useState('')
  const [whCity, setWhCity] = useState('')
  const [whState, setWhState] = useState('')
  const [whPostal, setWhPostal] = useState('')
  const [whCountry, setWhCountry] = useState('')
  const [variantEdits, setVariantEdits] = useState<Record<string, { sku: string; price: string; unitCost: string }>>({})

  const productOptions = useMemo(() => [
    opt1Name.trim() && opt1Values.trim() ? { name: opt1Name.trim(), values: opt1Values.split(',').map((s) => s.trim()).filter(Boolean) } : null,
    opt2Name.trim() && opt2Values.trim() ? { name: opt2Name.trim(), values: opt2Values.split(',').map((s) => s.trim()).filter(Boolean) } : null,
  ].filter(Boolean) as { name: string; values: string[] }[], [opt1Name, opt1Values, opt2Name, opt2Values])

  const variantRows = useMemo(() => {
    const combos = productOptions.length ? cartesianProduct(productOptions) : [{}]
    return combos.map((ov) => {
      const key = Object.entries(ov).map(([k, v]) => `${k}=${v}`).join('|') || 'default'
      const edits = variantEdits[key]
      return {
        key,
        title: Object.keys(ov).length ? variantTitle(ov) : 'Default',
        optionValues: ov,
        sku: edits?.sku ?? variantSku(productSku, ov),
        price: edits?.price ?? productPrice,
        unitCost: edits?.unitCost ?? productCost,
      }
    })
  }, [productOptions, productSku, productPrice, productCost, variantEdits])

  function formatAddress(addr?: LocationAddress) {
    if (!addr) return null
    const parts = [addr.line1, addr.line2, [addr.city, addr.state].filter(Boolean).join(', '), addr.postalCode, addr.country].filter(Boolean)
    return parts.join(' · ')
  }

  function resetVendorForm() {
    setVendorNameInput('')
    setVendorLead('14')
    setVendorEmail('')
    setVendorPhone('')
    setVendorPaymentTerms('Net 30')
    setVendorNotes('')
    setVendorRecurring(true)
  }

  function resetProductForm() {
    setProductTitle('')
    setProductBrand('')
    setProductDesc('')
    setProductSku('')
    setProductPrice('')
    setProductCost('')
    setProductReorder('0')
    setOpt1Values('')
    setOpt2Values('')
    setVariantEdits({})
    setEditVariants([])
  }

  function resetWarehouseForm() {
    setWhCode('')
    setWhName('')
    setWhDefault(false)
    setWhContactName('')
    setWhContactEmail('')
    setWhContactPhone('')
    setWhAddrLine1('')
    setWhAddrLine2('')
    setWhCity('')
    setWhState('')
    setWhPostal('')
    setWhCountry('')
  }

  function closeModal() {
    setModal(null)
    resetVendorForm()
    resetProductForm()
    resetWarehouseForm()
  }

  function openCreate(kind: InvModal extends null ? never : NonNullable<InvModal>['kind']) {
    if (kind === 'vendor') { resetVendorForm(); setModal({ kind: 'vendor' }) }
    else if (kind === 'product') { resetProductForm(); setModal({ kind: 'product' }) }
    else if (kind === 'warehouse') { resetWarehouseForm(); setModal({ kind: 'warehouse' }) }
    else setModal({ kind } as InvModal)
  }

  function startEditVendor(vendorId: string) {
    const v = state.vendors.find((x) => x.id === vendorId)
    if (!v) return
    setModal({ kind: 'vendor', id: vendorId })
    setVendorNameInput(v.name)
    setVendorLead(String(v.leadTimeDays))
    setVendorEmail(v.contactEmail ?? '')
    setVendorPhone(v.phone ?? '')
    setVendorPaymentTerms(v.paymentTerms ?? '')
    setVendorNotes(v.notes ?? '')
    setVendorRecurring(v.isRecurring)
  }

  function startEditProduct(productId: string) {
    const pm = state.productMasters.find((p) => p.id === productId)
    const single = state.products.find((p) => p.id === productId)
    const master = pm ?? (single ? { id: single.id, title: single.name, description: undefined, brand: undefined, options: [], variants: [single] } : null)
    if (!master) return
    setModal({ kind: 'product', id: productId })
    setProductTitle(master.title)
    setProductBrand(master.brand ?? '')
    setProductDesc(master.description ?? '')
    setEditVariants(master.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      price: String(v.price),
      unitCost: String(v.unitCost),
      reorderPoint: String(v.reorderPoint),
      title: v.optionValues ? Object.values(v.optionValues).join(' / ') : undefined,
    })))
  }

  function startEditWarehouse(warehouseId: string) {
    const w = state.warehouses.find((x) => x.id === warehouseId)
    if (!w) return
    setModal({ kind: 'warehouse', id: warehouseId })
    setWhCode(w.code)
    setWhName(w.name)
    setWhDefault(w.isDefault)
    setWhContactName(w.contactName ?? '')
    setWhContactEmail(w.contactEmail ?? '')
    setWhContactPhone(w.contactPhone ?? '')
    setWhAddrLine1(w.address?.line1 ?? '')
    setWhAddrLine2(w.address?.line2 ?? '')
    setWhCity(w.address?.city ?? '')
    setWhState(w.address?.state ?? '')
    setWhPostal(w.address?.postalCode ?? '')
    setWhCountry(w.address?.country ?? '')
    setTab('warehouses')
  }

  function cancelEdit() {
    closeModal()
  }

  const stockRows = stockWarehouseFilter
    ? state.stockByWarehouse.filter((s) => s.warehouseId === stockWarehouseFilter && s.onHand !== 0)
    : state.stockByWarehouse.filter((s) => s.onHand !== 0)

  const totalOnHand = (variantId: string) => {
    const rows = state.stockByWarehouse.filter((s) => s.variantId === variantId)
    if (rows.length > 0) return rows.reduce((sum, s) => sum + s.onHand, 0)
    return state.products.find((p) => p.id === variantId)?.stock ?? 0
  }

  useEffect(() => {
    if (!rcvPo) return
    const po = state.purchaseOrders.find((p) => p.id === rcvPo)
    const line = po?.lines.find((l) => (l.receivedQty ?? 0) < l.qty) ?? po?.lines[0]
    if (line?.productId) setRcvVariant(line.productId)
  }, [rcvPo, state.purchaseOrders])

  async function onAddVendor(e: FormEvent) {
    e.preventDefault()
    if (!vendorNameInput.trim()) return
    const lead = Number(vendorLead) || 14
    const payload = {
      name: vendorNameInput.trim(),
      leadTimeDays: lead,
      contactEmail: vendorEmail.trim() || undefined,
      phone: vendorPhone.trim() || undefined,
      paymentTerms: vendorPaymentTerms.trim() || undefined,
      notes: vendorNotes.trim() || undefined,
      isRecurring: vendorRecurring,
    }
    if (modal?.kind === 'vendor' && modal.id) {
      await spineMutate(
        () => updateVendor(auth!.token, modal.id!, payload),
        { type: 'UPDATE_VENDOR', vendorId: modal.id!, ...payload },
      )
      cancelEdit()
      return
    }
    await spineMutate(
      () => createVendor(auth!.token, auth!.tenantId, payload),
      { type: 'ADD_VENDOR', ...payload },
    )
    resetVendorForm()
    closeModal()
  }

  async function onAddWarehouse(e: FormEvent) {
    e.preventDefault()
    if (!whName.trim()) return
    const address: LocationAddress = {
      line1: whAddrLine1.trim() || undefined,
      line2: whAddrLine2.trim() || undefined,
      city: whCity.trim() || undefined,
      state: whState.trim() || undefined,
      postalCode: whPostal.trim() || undefined,
      country: whCountry.trim() || undefined,
    }
    const payload = {
      name: whName.trim(),
      isDefault: whDefault,
      contactName: whContactName.trim() || undefined,
      contactEmail: whContactEmail.trim() || undefined,
      contactPhone: whContactPhone.trim() || undefined,
      address: Object.values(address).some(Boolean) ? address : undefined,
    }
    if (modal?.kind === 'warehouse' && modal.id) {
      await spineMutate(
        () => updateWarehouse(auth!.token, modal.id!, payload),
        { type: 'UPDATE_WAREHOUSE', warehouseId: modal.id!, ...payload },
      )
      cancelEdit()
      return
    }
    if (!whCode.trim()) return
    await spineMutate(
      () => createWarehouse(auth!.token, auth!.tenantId, { code: whCode.trim(), ...payload }),
      { type: 'CREATE_WAREHOUSE', code: whCode.trim(), ...payload },
    )
    resetWarehouseForm()
    closeModal()
  }

  async function onAddProduct(e: FormEvent) {
    e.preventDefault()
    if (!productTitle.trim()) return

    if (modal?.kind === 'product' && modal.id) {
      const variants = editVariants.map((v) => ({
        id: v.id,
        sku: v.sku.trim(),
        title: v.title,
        price: Number(v.price) || 0,
        unitCost: Number(v.unitCost) || 0,
        reorderPoint: Number(v.reorderPoint) || 0,
      }))
      if (variants.some((v) => !v.sku)) return
      const demoPayload = {
        productId: modal.id,
        title: productTitle.trim(),
        description: productDesc.trim() || undefined,
        brand: productBrand.trim() || undefined,
        variants,
      }
      await spineMutate(
        async () => {
          await updateProduct(auth!.token, modal.id!, {
            title: demoPayload.title,
            description: demoPayload.description,
            brand: demoPayload.brand,
          })
          for (const v of variants) {
            await updateVariant(auth!.token, v.id, {
              sku: v.sku,
              title: v.title,
              price: v.price,
              unitCost: v.unitCost,
              reorderPoint: v.reorderPoint,
            })
          }
        },
        { type: 'UPDATE_PRODUCT', ...demoPayload },
      )
      cancelEdit()
      return
    }

    if (!productSku.trim()) return
    const reorderPoint = Number(productReorder) || 0
    const variants = variantRows.map((row) => ({
      sku: row.sku.trim(),
      title: row.title !== 'Default' ? row.title : undefined,
      optionValues: row.optionValues,
      price: Number(row.price) || 0,
      unitCost: Number(row.unitCost) || 0,
      reorderPoint,
    }))
    if (variants.some((v) => !v.sku)) return
    await spineMutate(
      () => createProduct(auth!.token, auth!.tenantId, {
        title: productTitle.trim(),
        brand: productBrand.trim() || undefined,
        description: productDesc.trim() || undefined,
        baseSku: productSku.trim(),
        options: productOptions,
        variants,
      }),
      { type: 'ADD_PRODUCT', title: productTitle.trim(), sku: variants[0].sku, price: variants[0].price, unitCost: variants[0].unitCost, reorderPoint },
    )
    resetProductForm()
    closeModal()
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
    closeModal()
  }

  async function onReceive(e: FormEvent) {
    e.preventDefault()
    const vendorId = rcvVendor || defaultVendor
    const qty = Number(rcvQty)
    const warehouseId = rcvWarehouse || defaultWarehouse?.id
    if (!vendorId || !qty) return
    const isSample = rcvType === 'sample'
    const po = state.purchaseOrders.find((p) => p.id === rcvPo)
    const variantId = rcvVariant || po?.lines[0]?.productId || defaultVariant
    if (!isSample && !variantId) return
    const poLine = po?.lines.find((l) => l.productId === variantId) ?? po?.lines[0]
    await spineMutate(
      () => createReceipt(auth!.token, auth!.tenantId, {
        vendorId,
        poId: rcvPo || undefined,
        warehouseId,
        type: rcvType,
        lines: isSample
          ? [{ description: 'Sample item', qty }]
          : [{ variantId, qty, poLineItemId: poLine?.id }],
      }),
      {
        type: 'CREATE_RECEIPT',
        vendorId,
        poId: rcvPo || undefined,
        warehouseId,
        variantId: isSample ? '' : variantId,
        qty,
        receiptType: rcvType,
        description: isSample ? 'Sample item' : undefined,
      },
    )
    closeModal()
    setTab('stock')
    setStockWarehouseFilter('')
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault()
    const variantId = adjVariant || defaultVariant
    const warehouseId = adjWarehouse || defaultWarehouse?.id
    const qtyDelta = Number(adjQty)
    if (!variantId || !qtyDelta) return
    await spineMutate(
      () => adjustInventory(auth!.token, auth!.tenantId, { variantId, qtyDelta, warehouseId, memo: adjMemo || undefined }),
      { type: 'ADJUST_STOCK', variantId, qtyDelta, warehouseId, memo: adjMemo || undefined },
    )
    setAdjQty('')
    setAdjMemo('')
    closeModal()
  }

  function modalIsEdit(m: InvModal): boolean {
    return m !== null && 'id' in m && Boolean(m.id)
  }

  const productMasters = state.productMasters.length > 0
    ? state.productMasters
    : state.products.map((p) => ({ id: p.id, title: p.name, description: undefined, variants: [p], options: [] }))

  const matchVendor = useCallback((v: typeof state.vendors[0], q: string) =>
    [v.name, v.contactEmail, v.phone, v.paymentTerms].some((s) => String(s ?? '').toLowerCase().includes(q)), [])
  const filteredVendors = useListFilter(state.vendors, search, matchVendor)
  const filteredProducts = useListFilter(productMasters, search, useCallback((p, q) =>
    [p.title, p.description, ...p.variants.map((v) => v.sku)].some((s) => String(s ?? '').toLowerCase().includes(q)), []))
  const filteredPos = useListFilter(state.purchaseOrders, search, useCallback((po, q) =>
    [po.poNumber, po.status, vendorName(po.vendorId)].some((s) => String(s ?? '').toLowerCase().includes(q)), [state.vendors]))
    .filter((po) => statusFilter === 'all' ? true : po.status === statusFilter)
  const filteredReceipts = useListFilter(state.receipts, search, useCallback((r, q) =>
    [r.id, r.type, vendorName(r.vendorId)].some((s) => String(s ?? '').toLowerCase().includes(q)), [state.vendors]))
  const filteredLedger = useListFilter(state.ledger, search, useCallback((e, q) => {
    const p = productById(e.productId)
    return [p?.sku, p?.name, e.reason, e.warehouseCode].some((s) => String(s ?? '').toLowerCase().includes(q))
  }, [state.products]))
  const filteredWarehouses = useListFilter(state.warehouses, search, useCallback((w, q) =>
    [w.code, w.name, w.contactEmail].some((s) => String(s ?? '').toLowerCase().includes(q)), []))

  const filteredStockRows = useListFilter(stockRows, search, useCallback((s, q) => {
    const p = productById(s.variantId)
    return [s.sku, p?.name, s.warehouseCode].some((x) => String(x ?? '').toLowerCase().includes(q))
  }, [state.products]))

  const tabAction = (() => {
    if (tab === 'master') return (
      <div className="flex gap-1">
        <Button variant="secondary" onClick={() => openCreate('vendor')}>+ Vendor</Button>
        <Button variant="secondary" onClick={() => openCreate('product')}>+ Product</Button>
      </div>
    )
    if (tab === 'purchase_orders') return <Button variant="secondary" onClick={() => openCreate('po')}>+</Button>
    if (tab === 'receipts') return <Button variant="secondary" onClick={() => openCreate('receipt')}>+</Button>
    if (tab === 'adjustments') return <Button variant="secondary" onClick={() => openCreate('adjustment')}>+</Button>
    if (tab === 'warehouses') return <Button variant="secondary" onClick={() => openCreate('warehouse')}>+</Button>
    return undefined
  })()

  function WarehouseSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <Select value={value || defaultWarehouse?.id || ''} onChange={(e) => onChange(e.target.value)}>
        {state.warehouses.map((w) => (
          <option key={w.id} value={w.id}>{w.code} — {w.name}{w.isDefault ? ' (default)' : ''}</option>
        ))}
      </Select>
    )
  }

  return (
    <div className="space-y-4">
      <SectionTitle sub="Inventory transactions and stock by location — LightsOff is the system of record; movements push to Shopify.">
        Inventory
      </SectionTitle>

      <SubTabs tabs={INV_TABS} active={tab} onChange={(t) => { setTab(t); setSearch(''); setStatusFilter('all') }} action={tabAction} />

      {tab === 'stock' && (
        <div className="space-y-2">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search SKU, product…"
            count={stockWarehouseFilter ? filteredStockRows.length : state.products.length}
            filters={
              <Select value={stockWarehouseFilter} onChange={(e) => setStockWarehouseFilter(e.target.value)} className="max-w-[200px]">
                <option value="">All locations</option>
                {state.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                ))}
              </Select>
            }
          />
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  {!stockWarehouseFilter && <th className="px-4 py-2.5 font-medium">Location</th>}
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium text-right">On hand</th>
                  <th className="px-4 py-2.5 font-medium text-right">Reorder pt</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stockWarehouseFilter ? (
                  filteredStockRows.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No stock at this location.</td></tr>
                  ) : filteredStockRows.map((s) => {
                    const p = productById(s.variantId)
                    return (
                      <tr key={`${s.warehouseId}-${s.variantId}`} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{s.sku}</td>
                        <td className="px-4 py-2.5">{p?.name ?? s.sku}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${s.onHand === 0 ? 'text-rose-600' : s.onHand <= s.reorderPoint ? 'text-amber-600' : ''}`}>
                          {s.onHand}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{s.reorderPoint}</td>
                        <td className="px-4 py-2.5">
                          {s.onHand === 0 ? <Badge tone="rose">out of stock</Badge>
                            : s.onHand <= s.reorderPoint ? <Badge tone="amber">below reorder</Badge>
                            : <Badge tone="emerald">healthy</Badge>}
                        </td>
                      </tr>
                    )
                  })
                ) : state.products.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No products yet — add one under Master data.</td></tr>
                ) : state.products.map((p) => {
                  const onHand = totalOnHand(p.id)
                  return (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {state.stockByWarehouse.filter((s) => s.variantId === p.id && s.onHand > 0).map((s) => s.warehouseCode).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.sku}</td>
                    <td className="px-4 py-2.5">{p.name}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${onHand === 0 ? 'text-rose-600' : onHand <= p.reorderPoint ? 'text-amber-600' : ''}`}>
                      {onHand}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{p.reorderPoint}</td>
                    <td className="px-4 py-2.5">
                      {onHand === 0 ? <Badge tone="rose">out of stock</Badge>
                        : onHand <= p.reorderPoint ? <Badge tone="amber">below reorder point</Badge>
                        : <Badge tone="emerald">healthy</Badge>}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'master' && (
        <div className="space-y-3">
          <ListToolbar search={search} onSearchChange={setSearch} placeholder="Search vendors & products…" />
          <Card className="p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Vendors ({filteredVendors.length})</div>
            <div className="space-y-1">
              {filteredVendors.length === 0 ? (
                <p className="text-sm text-slate-400">No vendors — click + Vendor to add one.</p>
              ) : filteredVendors.map((v) => (
                <ListRow key={v.id}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{v.name}</span>
                    <Badge tone="slate">{v.leadTimeDays}d</Badge>
                    {v.paymentTerms && <Badge tone="sky">{v.paymentTerms}</Badge>}
                    <Button type="button" variant="ghost" className="ml-auto" onClick={() => startEditVendor(v.id)}>Edit</Button>
                  </div>
                  <div className="text-[11px] text-slate-500">{[v.contactEmail, v.phone].filter(Boolean).join(' · ')}</div>
                </ListRow>
              ))}
            </div>
          </Card>
          <Card className="p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Products ({filteredProducts.length})</div>
            <div className="space-y-1">
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-slate-400">No products yet.</p>
              ) : filteredProducts.map((pm) => (
                <ListRow key={pm.id}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{pm.title}</div>
                      <div className="mt-1 space-y-0.5">
                        {pm.variants.map((v) => (
                          <div key={v.id} className="flex justify-between text-[11px] text-slate-600">
                            <span className="font-mono">{v.sku}</span>
                            <span>${v.price.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" onClick={() => startEditProduct(pm.id)}>Edit</Button>
                  </div>
                </ListRow>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'purchase_orders' && (
        <div className="space-y-2">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search POs…"
            count={filteredPos.length}
            filters={
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[140px]">
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="partially_received">Partial</option>
                <option value="received">Received</option>
              </Select>
            }
          />
          <div className="space-y-1.5">
            {filteredPos.length === 0 ? (
              <Card className="p-3 text-sm text-slate-400">No purchase orders. Click + to create one.</Card>
            ) : filteredPos.map((po) => (
              <Card key={po.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{po.poNumber ?? po.id.slice(0, 8) + '…'}</span>
                  <Badge tone={PO_STATUS_TONE[po.status]}>{po.status.replace(/_/g, ' ')}</Badge>
                  <Badge tone={po.source === 'manual' ? 'slate' : 'indigo'}>
                    {po.source === 'ai_capture' ? '✦ from AI capture' : po.source === 'ai_reorder' ? '✦ AI reorder suggestion' : 'manual'}
                  </Badge>
                  <span className="ml-auto text-xs text-slate-400">{vendorName(po.vendorId)} · {timeAgo(po.createdAt)}</span>
                </div>
                <div className="mt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="py-1.5 font-medium">SKU / product</th>
                        <th className="py-1.5 font-medium text-right">Ordered</th>
                        <th className="py-1.5 font-medium text-right">Received</th>
                        <th className="py-1.5 font-medium text-right">Outstanding</th>
                        <th className="py-1.5 font-medium text-right">Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map((l) => {
                        const p = productById(l.productId)
                        const received = l.receivedQty ?? 0
                        const outstanding = Math.max(0, l.qty - received)
                        return (
                          <tr key={l.id ?? l.productId} className="border-b border-slate-50 last:border-0">
                            <td className="py-1.5 text-slate-600">{p?.sku ?? l.productId.slice(0, 8)} — {p?.name ?? '—'}</td>
                            <td className="py-1.5 text-right">{l.qty}</td>
                            <td className={`py-1.5 text-right font-medium ${received < l.qty ? 'text-amber-600' : received > l.qty ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {received}
                            </td>
                            <td className="py-1.5 text-right text-slate-500">{outstanding}</td>
                            <td className="py-1.5 text-right text-slate-400">${(l.lineTotal ?? l.qty * l.unitCost).toFixed(2)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {po.linkedBills && po.linkedBills.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    Linked bills: {po.linkedBills.map((b) => b.billNumber ?? b.id.slice(0, 8)).join(', ')}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'receipts' && (
        <div className="space-y-2">
          <ListToolbar search={search} onSearchChange={setSearch} placeholder="Search receipts…" count={filteredReceipts.length} />
          <div className="space-y-1.5">
            {filteredReceipts.length === 0 ? (
              <Card className="p-3 text-sm text-slate-400">No receipts yet. Click + to record one.</Card>
            ) : filteredReceipts.map((r) => (
              <ListRow key={r.id}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold">{r.id.slice(0, 8)}…</span>
                  <Badge tone={r.type === 'sample' ? 'indigo' : 'sky'}>{r.type}</Badge>
                  {r.warehouseCode && <Badge tone="slate">{r.warehouseCode}</Badge>}
                  <span className="ml-auto text-[11px] text-slate-400">{vendorName(r.vendorId)} · {timeAgo(r.createdAt)}</span>
                </div>
                <div className="text-xs text-slate-600">{r.lines.map((l, i) => <div key={i}>+{l.qty} {l.description}</div>)}</div>
                {r.discrepancy && <div className="mt-1 text-xs text-amber-700">⚠ {r.discrepancy}</div>}
              </ListRow>
            ))}
          </div>
        </div>
      )}

      {tab === 'adjustments' && (
        <Card className="p-4 text-sm text-slate-500">Click <strong>+</strong> to post a stock adjustment at a location.</Card>
      )}

      {tab === 'ledger' && (
        <div className="space-y-2">
          <ListToolbar search={search} onSearchChange={setSearch} placeholder="Search ledger…" count={filteredLedger.length} />
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium text-right">Δ</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No ledger entries.</td></tr>
                ) : filteredLedger.map((e) => {
                  const p = productById(e.productId)
                  return (
                    <tr key={e.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-1.5 font-mono text-xs">{p?.sku ?? e.productId.slice(0, 8)}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-500">{e.warehouseCode ?? '—'}</td>
                      <td className={`px-3 py-1.5 text-right text-xs font-medium ${e.qtyDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{e.qtyDelta > 0 ? `+${e.qtyDelta}` : e.qtyDelta}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-500">{e.reason.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-1.5 text-[11px] text-slate-400">{timeAgo(e.at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'warehouses' && (
        <div className="space-y-2">
          <ListToolbar search={search} onSearchChange={setSearch} placeholder="Search locations…" count={filteredWarehouses.length} />
          <div className="space-y-1.5">
            {filteredWarehouses.length === 0 ? (
              <Card className="p-3 text-sm text-slate-400">No locations. Click + to add one.</Card>
            ) : filteredWarehouses.map((w) => (
              <ListRow key={w.id}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold">{w.code}</span>
                  <span className="text-sm">{w.name}</span>
                  {w.isDefault && <Badge tone="emerald">default</Badge>}
                  <Button type="button" variant="ghost" className="ml-auto" onClick={() => startEditWarehouse(w.id)}>Edit</Button>
                </div>
                {formatAddress(w.address) && <div className="text-[11px] text-slate-500">{formatAddress(w.address)}</div>}
              </ListRow>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal open={modal?.kind === 'vendor'} title={modalIsEdit(modal) ? 'Edit vendor' : 'Add vendor'} onClose={closeModal}>
        <form onSubmit={onAddVendor}><FormPanel title="">
          <Field label="Name"><Input value={vendorNameInput} onChange={(e) => setVendorNameInput(e.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Email"><Input type="email" value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} /></Field>
            <Field label="Phone"><Input value={vendorPhone} onChange={(e) => setVendorPhone(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Lead time (days)"><Input type="number" value={vendorLead} onChange={(e) => setVendorLead(e.target.value)} /></Field>
            <Field label="Payment terms"><Input value={vendorPaymentTerms} onChange={(e) => setVendorPaymentTerms(e.target.value)} /></Field>
          </div>
          <Field label="Notes"><TextArea value={vendorNotes} onChange={(e) => setVendorNotes(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vendorRecurring} onChange={(e) => setVendorRecurring(e.target.checked)} /> Recurring vendor</label>
          <Button type="submit" className="w-full">{modalIsEdit(modal) ? 'Save' : 'Create'}</Button>
        </FormPanel></form>
      </Modal>

      <Modal open={modal?.kind === 'product'} title={modalIsEdit(modal) ? 'Edit product' : 'Add product'} onClose={closeModal} wide>
        <form onSubmit={onAddProduct}><FormPanel title="">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Title"><Input value={productTitle} onChange={(e) => setProductTitle(e.target.value)} required /></Field>
            <Field label="Brand"><Input value={productBrand} onChange={(e) => setProductBrand(e.target.value)} /></Field>
          </div>
          <Field label="Description"><TextArea value={productDesc} onChange={(e) => setProductDesc(e.target.value)} /></Field>
          {modal?.kind === 'product' && modalIsEdit(modal) ? (
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] uppercase text-slate-400"><th className="py-1">Variant</th><th>SKU</th><th>Price</th><th>Cost</th></tr></thead>
              <tbody>{editVariants.map((row, i) => (
                <tr key={row.id}><td className="py-1 text-xs">{row.title}</td>
                  <td><Input value={row.sku} onChange={(e) => setEditVariants((rows) => rows.map((r, j) => j === i ? { ...r, sku: e.target.value } : r))} className="font-mono text-xs" /></td>
                  <td><Input type="number" value={row.price} onChange={(e) => setEditVariants((rows) => rows.map((r, j) => j === i ? { ...r, price: e.target.value } : r))} /></td>
                  <td><Input type="number" value={row.unitCost} onChange={(e) => setEditVariants((rows) => rows.map((r, j) => j === i ? { ...r, unitCost: e.target.value } : r))} /></td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Base SKU"><Input value={productSku} onChange={(e) => setProductSku(e.target.value)} required /></Field>
                <Field label="Reorder pt"><Input type="number" value={productReorder} onChange={(e) => setProductReorder(e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Price"><Input type="number" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} /></Field>
                <Field label="Unit cost"><Input type="number" value={productCost} onChange={(e) => setProductCost(e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Option 1"><Input value={opt1Values} onChange={(e) => setOpt1Values(e.target.value)} placeholder="S, M, L" /></Field>
                <Field label="Option 2"><Input value={opt2Values} onChange={(e) => setOpt2Values(e.target.value)} placeholder="Blue, Black" /></Field>
              </div>
            </>
          )}
          <Button type="submit" className="w-full">{modalIsEdit(modal) ? 'Save product' : 'Create product'}</Button>
        </FormPanel></form>
      </Modal>

      <Modal open={modal?.kind === 'po'} title="Create purchase order" onClose={closeModal} wide>
        <form onSubmit={onCreatePo}><FormPanel title="">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Vendor"><Select value={poVendor || defaultVendor} onChange={(e) => setPoVendor(e.target.value)}>{state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
            <Field label="PO #"><Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} /></Field>
          </div>
          {poLines.map((line, i) => (
            <div key={i} className="grid grid-cols-[1fr_72px_88px] gap-2">
              <Select value={line.productId || defaultVariant} onChange={(e) => setPoLines((rows) => rows.map((r, j) => j === i ? { ...r, productId: e.target.value } : r))}>{state.products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}</Select>
              <Input type="number" value={line.qty} onChange={(e) => setPoLines((rows) => rows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))} />
              <Input type="number" step="0.01" value={line.unitCost} onChange={(e) => setPoLines((rows) => rows.map((r, j) => j === i ? { ...r, unitCost: e.target.value } : r))} />
            </div>
          ))}
          <Button type="button" variant="ghost" onClick={() => setPoLines((rows) => [...rows, { productId: defaultVariant, qty: '10', unitCost: '' }])}>+ line</Button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={poSend} onChange={(e) => setPoSend(e.target.checked)} /> Send immediately</label>
          <Button type="submit" className="w-full">Create PO</Button>
        </FormPanel></form>
      </Modal>

      <Modal open={modal?.kind === 'receipt'} title="Record receipt" onClose={closeModal}>
        <form onSubmit={onReceive}><FormPanel title="">
          <Field label="Location"><WarehouseSelect value={rcvWarehouse} onChange={setRcvWarehouse} /></Field>
          <Field label="Vendor"><Select value={rcvVendor || defaultVendor} onChange={(e) => setRcvVendor(e.target.value)}>{state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
          <Field label="Type"><Select value={rcvType} onChange={(e) => setRcvType(e.target.value as 'commercial' | 'sample')}><option value="commercial">Commercial</option><option value="sample">Sample</option></Select></Field>
          <Field label="PO (optional)"><Select value={rcvPo} onChange={(e) => setRcvPo(e.target.value)}><option value="">—</option>{state.purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.id.slice(0, 8)}</option>)}</Select></Field>
          {rcvType === 'commercial' && <Field label="Product"><Select value={rcvVariant || defaultVariant} onChange={(e) => setRcvVariant(e.target.value)}>{state.products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}</Select></Field>}
          <Field label="Qty"><Input type="number" value={rcvQty} onChange={(e) => setRcvQty(e.target.value)} required /></Field>
          <Button type="submit" className="w-full">Record receipt</Button>
        </FormPanel></form>
      </Modal>

      <Modal open={modal?.kind === 'adjustment'} title="Adjust stock" onClose={closeModal}>
        <form onSubmit={onAdjust}><FormPanel title="">
          <Field label="Location"><WarehouseSelect value={adjWarehouse} onChange={setAdjWarehouse} /></Field>
          <Field label="Product"><Select value={adjVariant || defaultVariant} onChange={(e) => setAdjVariant(e.target.value)}>{state.products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}</Select></Field>
          <Field label="Qty change (+/-)"><Input type="number" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} required /></Field>
          <Field label="Memo"><Input value={adjMemo} onChange={(e) => setAdjMemo(e.target.value)} /></Field>
          <Button type="submit" className="w-full">Post adjustment</Button>
        </FormPanel></form>
      </Modal>

      <Modal open={modal?.kind === 'warehouse'} title={modalIsEdit(modal) ? 'Edit location' : 'Add location'} onClose={closeModal} wide>
        <form onSubmit={onAddWarehouse}><FormPanel title="">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Code"><Input value={whCode} onChange={(e) => setWhCode(e.target.value)} required disabled={modalIsEdit(modal)} /></Field>
            <Field label="Name"><Input value={whName} onChange={(e) => setWhName(e.target.value)} required /></Field>
          </div>
          <Field label="Contact email"><Input value={whContactEmail} onChange={(e) => setWhContactEmail(e.target.value)} /></Field>
          <Field label="Address line 1"><Input value={whAddrLine1} onChange={(e) => setWhAddrLine1(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={whDefault} onChange={(e) => setWhDefault(e.target.checked)} /> Default location</label>
          <Button type="submit" className="w-full">{modalIsEdit(modal) ? 'Save' : 'Create'}</Button>
        </FormPanel></form>
      </Modal>
    </div>
  )
}
