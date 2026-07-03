import type { AppState } from '../store'

export type ReportSource =
  | 'bills'
  | 'stock'
  | 'purchase_orders'
  | 'receipts'
  | 'payments'
  | 'claims'
  | 'journal'
  | 'ledger'
  | 'events'

export type ChartType = 'bar' | 'line' | 'donut'
export type ChartMeasure = 'count' | string

export interface ReportFieldDef {
  id: string
  label: string
  kind: 'text' | 'number' | 'currency' | 'date'
  chartGroupable?: boolean
  chartMeasurable?: boolean
}

export interface ReportFilterDef {
  id: string
  label: string
  type: 'select' | 'date' | 'checkbox'
  options?: { value: string; label: string }[]
}

export interface ReportSourceDef {
  id: ReportSource
  label: string
  fields: ReportFieldDef[]
  filters: ReportFilterDef[]
  defaultFields: string[]
  defaultChart?: { groupBy: string; measure: ChartMeasure; type: ChartType }
}

export interface ReportConfig {
  source: ReportSource
  filters: Record<string, string>
  visibleFields: string[]
  chart: {
    enabled: boolean
    type: ChartType
    groupBy: string
    measure: ChartMeasure
  }
}

export interface ReportRow {
  id: string
  values: Record<string, string | number>
}

export interface ChartPoint {
  label: string
  value: number
}

export interface ReportResult {
  rows: ReportRow[]
  totals: { label: string; value: string }[]
  chartData: ChartPoint[]
}

export interface SavedReport {
  id: string
  name: string
  config: ReportConfig
}

const STORAGE_KEY = 'lightsoff.savedReports'

export function loadSavedReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedReport[]) : []
  } catch {
    return []
  }
}

export function saveReportPreset(name: string, config: ReportConfig): SavedReport[] {
  const list = loadSavedReports()
  const entry: SavedReport = { id: crypto.randomUUID(), name, config }
  const next = [...list, entry]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function deleteReportPreset(id: string): SavedReport[] {
  const next = loadSavedReports().filter((r) => r.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export const REPORT_SOURCES: ReportSourceDef[] = [
  {
    id: 'bills',
    label: 'Vendor bills',
    defaultFields: ['vendor', 'billNumber', 'amount', 'balance', 'dueDate', 'status'],
    defaultChart: { groupBy: 'status', measure: 'amount', type: 'donut' },
    filters: [
      { id: 'status', label: 'Status', type: 'select', options: [
        { value: '', label: 'All' }, { value: 'unpaid', label: 'Unpaid' },
        { value: 'partially_paid', label: 'Partial' }, { value: 'paid', label: 'Paid' },
      ]},
      { id: 'dateFrom', label: 'Due from', type: 'date' },
      { id: 'dateTo', label: 'Due to', type: 'date' },
    ],
    fields: [
      { id: 'vendor', label: 'Vendor', kind: 'text', chartGroupable: true },
      { id: 'billNumber', label: 'Bill #', kind: 'text' },
      { id: 'amount', label: 'Amount', kind: 'currency', chartMeasurable: true },
      { id: 'amountPaid', label: 'Paid', kind: 'currency', chartMeasurable: true },
      { id: 'balance', label: 'Balance', kind: 'currency', chartMeasurable: true },
      { id: 'dueDate', label: 'Due date', kind: 'date', chartGroupable: true },
      { id: 'status', label: 'Status', kind: 'text', chartGroupable: true },
      { id: 'memo', label: 'Memo', kind: 'text' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock & valuation',
    defaultFields: ['sku', 'name', 'warehouse', 'onHand', 'reorderPoint', 'inventoryValue'],
    defaultChart: { groupBy: 'warehouse', measure: 'inventoryValue', type: 'bar' },
    filters: [
      { id: 'warehouseId', label: 'Location', type: 'select', options: [] },
      { id: 'lowStockOnly', label: 'Low stock only', type: 'checkbox' },
    ],
    fields: [
      { id: 'sku', label: 'SKU', kind: 'text', chartGroupable: true },
      { id: 'name', label: 'Product', kind: 'text', chartGroupable: true },
      { id: 'warehouse', label: 'Location', kind: 'text', chartGroupable: true },
      { id: 'onHand', label: 'On hand', kind: 'number', chartMeasurable: true },
      { id: 'reorderPoint', label: 'Reorder pt', kind: 'number' },
      { id: 'unitCost', label: 'Unit cost', kind: 'currency', chartMeasurable: true },
      { id: 'inventoryValue', label: 'Inventory value', kind: 'currency', chartMeasurable: true },
      { id: 'price', label: 'Retail price', kind: 'currency' },
    ],
  },
  {
    id: 'purchase_orders',
    label: 'Purchase orders',
    defaultFields: ['poNumber', 'vendor', 'status', 'total', 'createdAt'],
    defaultChart: { groupBy: 'status', measure: 'total', type: 'bar' },
    filters: [
      { id: 'status', label: 'Status', type: 'select', options: [
        { value: '', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' },
        { value: 'partially_received', label: 'Partial' }, { value: 'received', label: 'Received' },
      ]},
      { id: 'dateFrom', label: 'From', type: 'date' },
      { id: 'dateTo', label: 'To', type: 'date' },
    ],
    fields: [
      { id: 'poNumber', label: 'PO #', kind: 'text' },
      { id: 'vendor', label: 'Vendor', kind: 'text', chartGroupable: true },
      { id: 'status', label: 'Status', kind: 'text', chartGroupable: true },
      { id: 'total', label: 'Total', kind: 'currency', chartMeasurable: true },
      { id: 'lineCount', label: 'Lines', kind: 'number', chartMeasurable: true },
      { id: 'createdAt', label: 'Created', kind: 'date', chartGroupable: true },
      { id: 'source', label: 'Source', kind: 'text', chartGroupable: true },
    ],
  },
  {
    id: 'receipts',
    label: 'Receipts',
    defaultFields: ['vendor', 'type', 'warehouse', 'qty', 'createdAt'],
    defaultChart: { groupBy: 'type', measure: 'qty', type: 'donut' },
    filters: [
      { id: 'type', label: 'Type', type: 'select', options: [
        { value: '', label: 'All' }, { value: 'commercial', label: 'Commercial' }, { value: 'sample', label: 'Sample' },
      ]},
      { id: 'dateFrom', label: 'From', type: 'date' },
      { id: 'dateTo', label: 'To', type: 'date' },
    ],
    fields: [
      { id: 'vendor', label: 'Vendor', kind: 'text', chartGroupable: true },
      { id: 'type', label: 'Type', kind: 'text', chartGroupable: true },
      { id: 'warehouse', label: 'Location', kind: 'text', chartGroupable: true },
      { id: 'qty', label: 'Qty received', kind: 'number', chartMeasurable: true },
      { id: 'createdAt', label: 'Date', kind: 'date', chartGroupable: true },
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    defaultFields: ['vendor', 'amount', 'method', 'paidAt'],
    defaultChart: { groupBy: 'vendor', measure: 'amount', type: 'bar' },
    filters: [
      { id: 'dateFrom', label: 'From', type: 'date' },
      { id: 'dateTo', label: 'To', type: 'date' },
    ],
    fields: [
      { id: 'vendor', label: 'Vendor', kind: 'text', chartGroupable: true },
      { id: 'amount', label: 'Amount', kind: 'currency', chartMeasurable: true },
      { id: 'method', label: 'Method', kind: 'text', chartGroupable: true },
      { id: 'paidAt', label: 'Paid at', kind: 'date', chartGroupable: true },
      { id: 'memo', label: 'Memo', kind: 'text' },
    ],
  },
  {
    id: 'claims',
    label: 'Expense claims',
    defaultFields: ['vendorName', 'category', 'amount', 'status', 'date'],
    defaultChart: { groupBy: 'category', measure: 'amount', type: 'bar' },
    filters: [
      { id: 'status', label: 'Status', type: 'select', options: [
        { value: '', label: 'All' }, { value: 'pending_review', label: 'Pending' },
        { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' },
      ]},
      { id: 'dateFrom', label: 'From', type: 'date' },
      { id: 'dateTo', label: 'To', type: 'date' },
    ],
    fields: [
      { id: 'vendorName', label: 'Payee', kind: 'text', chartGroupable: true },
      { id: 'category', label: 'Category', kind: 'text', chartGroupable: true },
      { id: 'amount', label: 'Amount', kind: 'currency', chartMeasurable: true },
      { id: 'status', label: 'Status', kind: 'text', chartGroupable: true },
      { id: 'date', label: 'Date', kind: 'date', chartGroupable: true },
    ],
  },
  {
    id: 'journal',
    label: 'Journal entries',
    defaultFields: ['memo', 'source', 'totalDebit', 'at'],
    defaultChart: { groupBy: 'source', measure: 'totalDebit', type: 'bar' },
    filters: [
      { id: 'source', label: 'Source', type: 'select', options: [
        { value: '', label: 'All' }, { value: 'manual', label: 'Manual' },
        { value: 'inventory_ap', label: 'Inventory AP' }, { value: 'expense_claim', label: 'Expense claim' },
        { value: 'shopify_revenue', label: 'Shopify' },
      ]},
      { id: 'dateFrom', label: 'From', type: 'date' },
      { id: 'dateTo', label: 'To', type: 'date' },
    ],
    fields: [
      { id: 'memo', label: 'Memo', kind: 'text' },
      { id: 'source', label: 'Source', kind: 'text', chartGroupable: true },
      { id: 'totalDebit', label: 'Debits', kind: 'currency', chartMeasurable: true },
      { id: 'totalCredit', label: 'Credits', kind: 'currency', chartMeasurable: true },
      { id: 'at', label: 'Posted', kind: 'date', chartGroupable: true },
      { id: 'autoPosted', label: 'Auto', kind: 'text', chartGroupable: true },
    ],
  },
  {
    id: 'ledger',
    label: 'Inventory ledger',
    defaultFields: ['sku', 'warehouse', 'qtyDelta', 'reason', 'at'],
    defaultChart: { groupBy: 'reason', measure: 'qtyDelta', type: 'bar' },
    filters: [
      { id: 'reason', label: 'Reason', type: 'select', options: [
        { value: '', label: 'All' }, { value: 'po_receipt', label: 'PO receipt' },
        { value: 'shopify_sale', label: 'Shopify sale' }, { value: 'manual_adjustment', label: 'Adjustment' },
        { value: 'sample_receipt', label: 'Sample' },
      ]},
      { id: 'dateFrom', label: 'From', type: 'date' },
      { id: 'dateTo', label: 'To', type: 'date' },
    ],
    fields: [
      { id: 'sku', label: 'SKU', kind: 'text', chartGroupable: true },
      { id: 'warehouse', label: 'Location', kind: 'text', chartGroupable: true },
      { id: 'qtyDelta', label: 'Qty Δ', kind: 'number', chartMeasurable: true },
      { id: 'reason', label: 'Reason', kind: 'text', chartGroupable: true },
      { id: 'at', label: 'When', kind: 'date', chartGroupable: true },
    ],
  },
  {
    id: 'events',
    label: 'Event bus',
    defaultFields: ['type', 'module', 'summary', 'at'],
    defaultChart: { groupBy: 'module', measure: 'count', type: 'donut' },
    filters: [
      { id: 'module', label: 'Module', type: 'select', options: [
        { value: '', label: 'All' }, { value: 'inventory', label: 'Inventory' },
        { value: 'finance', label: 'Finance' }, { value: 'marketing', label: 'Marketing' },
      ]},
      { id: 'dateFrom', label: 'From', type: 'date' },
      { id: 'dateTo', label: 'To', type: 'date' },
    ],
    fields: [
      { id: 'type', label: 'Type', kind: 'text', chartGroupable: true },
      { id: 'module', label: 'Module', kind: 'text', chartGroupable: true },
      { id: 'summary', label: 'Summary', kind: 'text' },
      { id: 'at', label: 'When', kind: 'date', chartGroupable: true },
    ],
  },
]

export function defaultConfig(source: ReportSource): ReportConfig {
  const def = REPORT_SOURCES.find((s) => s.id === source)!
  return {
    source,
    filters: {},
    visibleFields: [...def.defaultFields],
    chart: {
      enabled: true,
      type: def.defaultChart?.type ?? 'bar',
      groupBy: def.defaultChart?.groupBy ?? def.fields.find((f) => f.chartGroupable)?.id ?? 'status',
      measure: def.defaultChart?.measure ?? 'count',
    },
  }
}

function vendorName(state: AppState, id: string) {
  return state.vendors.find((v) => v.id === id)?.name ?? id.slice(0, 8)
}

function productSku(state: AppState, id: string) {
  return state.products.find((p) => p.id === id)?.sku ?? id.slice(0, 8)
}

function inDateRange(iso: string | undefined, from?: string, to?: string): boolean {
  if (!iso) return !from && !to
  const t = new Date(iso).getTime()
  if (from && t < new Date(from).getTime()) return false
  if (to && t > new Date(`${to}T23:59:59`).getTime()) return false
  return true
}

function formatDateBucket(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function extractRows(state: AppState, source: ReportSource, filters: Record<string, string>): ReportRow[] {
  switch (source) {
    case 'bills':
      return state.bills
        .filter((b) => !filters.status || b.status === filters.status)
        .filter((b) => inDateRange(b.dueDate, filters.dateFrom, filters.dateTo))
        .map((b) => ({
          id: b.id,
          values: {
            vendor: vendorName(state, b.vendorId),
            billNumber: b.billNumber ?? b.id.slice(0, 8),
            amount: b.amount,
            amountPaid: b.amountPaid ?? 0,
            balance: b.amount - (b.amountPaid ?? 0),
            dueDate: b.dueDate.slice(0, 10),
            status: b.status,
            memo: b.memo,
          },
        }))
    case 'stock': {
      const rows: ReportRow[] = []
      const whFilter = filters.warehouseId
      const lowOnly = filters.lowStockOnly === 'true'
      if (state.stockByWarehouse.length > 0) {
        for (const s of state.stockByWarehouse) {
          if (whFilter && s.warehouseId !== whFilter) continue
          if (lowOnly && s.onHand > s.reorderPoint) continue
          const p = state.products.find((x) => x.id === s.variantId)
          rows.push({
            id: `${s.warehouseId}-${s.variantId}`,
            values: {
              sku: s.sku,
              name: p?.name ?? s.sku,
              warehouse: s.warehouseCode,
              onHand: s.onHand,
              reorderPoint: s.reorderPoint,
              unitCost: p?.unitCost ?? 0,
              inventoryValue: s.onHand * (p?.unitCost ?? 0),
              price: p?.price ?? 0,
            },
          })
        }
      } else {
        for (const p of state.products) {
          if (lowOnly && p.stock > p.reorderPoint) continue
          rows.push({
            id: p.id,
            values: {
              sku: p.sku,
              name: p.name,
              warehouse: '—',
              onHand: p.stock,
              reorderPoint: p.reorderPoint,
              unitCost: p.unitCost,
              inventoryValue: p.stock * p.unitCost,
              price: p.price,
            },
          })
        }
      }
      return rows
    }
    case 'purchase_orders':
      return state.purchaseOrders
        .filter((po) => !filters.status || po.status === filters.status)
        .filter((po) => inDateRange(po.createdAt, filters.dateFrom, filters.dateTo))
        .map((po) => {
          const total = po.lines.reduce((s, l) => s + (l.lineTotal ?? l.qty * l.unitCost), 0)
          return {
            id: po.id,
            values: {
              poNumber: po.poNumber ?? po.id.slice(0, 8),
              vendor: vendorName(state, po.vendorId),
              status: po.status,
              total,
              lineCount: po.lines.length,
              createdAt: po.createdAt.slice(0, 10),
              source: po.source,
            },
          }
        })
    case 'receipts':
      return state.receipts
        .filter((r) => !filters.type || r.type === filters.type)
        .filter((r) => inDateRange(r.createdAt, filters.dateFrom, filters.dateTo))
        .map((r) => ({
          id: r.id,
          values: {
            vendor: vendorName(state, r.vendorId),
            type: r.type,
            warehouse: r.warehouseCode ?? '—',
            qty: r.lines.reduce((s, l) => s + l.qty, 0),
            createdAt: r.createdAt.slice(0, 10),
          },
        }))
    case 'payments':
      return state.payments
        .filter((p) => inDateRange(p.paidAt, filters.dateFrom, filters.dateTo))
        .map((p) => ({
          id: p.id,
          values: {
            vendor: vendorName(state, p.vendorId),
            amount: p.amount,
            method: p.method,
            paidAt: p.paidAt.slice(0, 10),
            memo: p.memo ?? '',
          },
        }))
    case 'claims':
      return state.claims
        .filter((c) => !filters.status || c.status === filters.status)
        .filter((c) => inDateRange(c.date, filters.dateFrom, filters.dateTo))
        .map((c) => ({
          id: c.id,
          values: {
            vendorName: c.vendorName,
            category: c.category,
            amount: c.amount,
            status: c.status,
            date: c.date.slice(0, 10),
          },
        }))
    case 'journal':
      return state.journal
        .filter((je) => !filters.source || je.source === filters.source)
        .filter((je) => inDateRange(je.at, filters.dateFrom, filters.dateTo))
        .map((je) => ({
          id: je.id,
          values: {
            memo: je.memo,
            source: je.source,
            totalDebit: je.lines.reduce((s, l) => s + l.debit, 0),
            totalCredit: je.lines.reduce((s, l) => s + l.credit, 0),
            at: je.at.slice(0, 10),
            autoPosted: je.autoPosted ? 'yes' : 'no',
          },
        }))
    case 'ledger':
      return state.ledger
        .filter((e) => !filters.reason || e.reason === filters.reason)
        .filter((e) => inDateRange(e.at, filters.dateFrom, filters.dateTo))
        .map((e) => ({
          id: e.id,
          values: {
            sku: productSku(state, e.productId),
            warehouse: e.warehouseCode ?? e.location ?? '—',
            qtyDelta: e.qtyDelta,
            reason: e.reason.replace(/_/g, ' '),
            at: e.at.slice(0, 10),
          },
        }))
    case 'events':
      return state.events
        .filter((e) => !filters.module || e.module === filters.module)
        .filter((e) => inDateRange(e.at, filters.dateFrom, filters.dateTo))
        .map((e) => ({
          id: e.id,
          values: {
            type: e.type,
            module: e.module,
            summary: e.summary,
            at: e.at.slice(0, 10),
          },
        }))
    default:
      return []
  }
}

function buildChartData(
  rows: ReportRow[],
  groupBy: string,
  measure: ChartMeasure,
  fieldDefs: ReportFieldDef[],
): ChartPoint[] {
  const groups = new Map<string, number>()
  const groupField = fieldDefs.find((f) => f.id === groupBy)
  for (const row of rows) {
    let key = String(row.values[groupBy] ?? 'Unknown')
    if (groupField?.kind === 'date') key = formatDateBucket(key)
    const prev = groups.get(key) ?? 0
    if (measure === 'count') {
      groups.set(key, prev + 1)
    } else {
      const n = Number(row.values[measure] ?? 0)
      groups.set(key, prev + (Number.isFinite(n) ? n : 0))
    }
  }
  return [...groups.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12)
}

function buildTotals(rows: ReportRow[], fieldDefs: ReportFieldDef[]): { label: string; value: string }[] {
  const measurable = fieldDefs.filter((f) => f.chartMeasurable)
  return measurable.slice(0, 3).map((f) => {
    const sum = rows.reduce((s, r) => s + (Number(r.values[f.id]) || 0), 0)
    const formatted = f.kind === 'currency'
      ? `$${sum.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : sum.toLocaleString()
    return { label: `Σ ${f.label}`, value: formatted }
  })
}

export function runReport(state: AppState, config: ReportConfig): ReportResult {
  const def = REPORT_SOURCES.find((s) => s.id === config.source)!
  const rows = extractRows(state, config.source, config.filters)
  const chartData = config.chart.enabled
    ? buildChartData(rows, config.chart.groupBy, config.chart.measure, def.fields)
    : []
  return {
    rows,
    totals: [{ label: 'Rows', value: String(rows.length) }, ...buildTotals(rows, def.fields)],
    chartData,
  }
}

export function sourceDef(id: ReportSource): ReportSourceDef {
  return REPORT_SOURCES.find((s) => s.id === id)!
}

export function enrichFilters(state: AppState, def: ReportSourceDef): ReportSourceDef {
  return {
    ...def,
    filters: def.filters.map((f) => {
      if (f.id === 'warehouseId' && def.id === 'stock') {
        return {
          ...f,
          options: [
            { value: '', label: 'All locations' },
            ...state.warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
          ],
        }
      }
      return f
    }),
  }
}

export function formatCell(value: string | number, kind: ReportFieldDef['kind']): string {
  if (kind === 'currency' && typeof value === 'number') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (kind === 'number' && typeof value === 'number') return value.toLocaleString()
  return String(value ?? '—')
}

export const BUILT_IN_PRESETS: { name: string; config: ReportConfig }[] = [
  { name: 'AP by status', config: { ...defaultConfig('bills'), filters: { status: 'unpaid' } } },
  { name: 'Low stock SKUs', config: { ...defaultConfig('stock'), filters: { lowStockOnly: 'true' }, visibleFields: ['sku', 'name', 'warehouse', 'onHand', 'reorderPoint'] } },
  { name: 'Open POs', config: { ...defaultConfig('purchase_orders'), filters: { status: 'sent' } } },
  { name: 'Expense claims', config: defaultConfig('claims') },
  { name: 'Stock movements', config: defaultConfig('ledger') },
]
