import { useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import { cashPosition } from '../ai/digest'
import {
  createBill, createExpenseClaim, createJournalEntry, EXPENSE_CATEGORIES,
  fetchAccounts, recordPayment, type AccountOption,
} from '../api/mutations'
import {
  Badge, Button, Card, ConfidenceBadge, Field, FormPanel, Input, SectionTitle, Select, Stat, SubTabs, timeAgo,
} from './ui'

const SOURCE_LABEL: Record<string, string> = {
  inventory_ap: 'Inventory AP event',
  ad_spend: 'Marketing ad spend',
  shopify_revenue: 'Shopify payout',
  expense_claim: 'Expense claim',
  manual: 'Manual entry',
}

const DEMO_ACCOUNTS: AccountOption[] = [
  { id: '1000', code: '1000', name: 'Cash', type: 'asset' },
  { id: '1100', code: '1100', name: 'Petty Cash', type: 'asset' },
  { id: '1200', code: '1200', name: 'Inventory', type: 'asset' },
  { id: '2000', code: '2000', name: 'Accounts Payable', type: 'liability' },
  { id: '3000', code: '3000', name: 'Owner Equity', type: 'equity' },
  { id: '4000', code: '4000', name: 'Sales Revenue', type: 'revenue' },
  { id: '5000', code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
  { id: '6900', code: '6900', name: 'General Expense', type: 'expense' },
]

import type { VendorBillLine } from '../types'

interface JournalLineDraft {
  accountCode: string
  debit: string
  credit: string
}

type FinTab = 'overview' | 'bills' | 'payments' | 'claims' | 'journal'

const FIN_TABS: { id: FinTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'bills', label: 'Bills' },
  { id: 'payments', label: 'Payments' },
  { id: 'claims', label: 'Claims' },
  { id: 'journal', label: 'Journal' },
]

export function Finance() {
  const { state, dispatch, spineMutate, auth, mode, can } = useStore()
  const [tab, setTab] = useState<FinTab>('overview')
  const { cash, revenue30d, expenses30d } = cashPosition(state)
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? '—'
  const unpaidTotal = state.bills
    .filter((b) => b.status === 'unpaid' || b.status === 'partially_paid')
    .reduce((s, b) => s + b.amount - (b.amountPaid ?? 0), 0)

  const [accounts, setAccounts] = useState<AccountOption[]>(DEMO_ACCOUNTS)
  const [billVendor, setBillVendor] = useState('')
  const [billPo, setBillPo] = useState('')
  const [billNumber, setBillNumber] = useState('')
  const [billDue, setBillDue] = useState('')
  const [billMemo, setBillMemo] = useState('')
  const [billLines, setBillLines] = useState([{ description: '', productId: '', qty: '1', unitCost: '' }])
  const [payVendor, setPayVendor] = useState('')
  const [payMemo, setPayMemo] = useState('')
  const [payAllocations, setPayAllocations] = useState([{ billId: '', amount: '' }])
  const [claimVendor, setClaimVendor] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [claimCategory, setClaimCategory] = useState<string>(EXPENSE_CATEGORIES[3].code)
  const [claimAutoApprove, setClaimAutoApprove] = useState(true)
  const [jeMemo, setJeMemo] = useState('')
  const [jeLines, setJeLines] = useState<JournalLineDraft[]>([
    { accountCode: '1200', debit: '', credit: '' },
    { accountCode: '2000', debit: '', credit: '' },
  ])

  const defaultVendor = state.vendors[0]?.id ?? ''
  const openBills = state.bills.filter((b) => b.status !== 'paid')

  useEffect(() => {
    if (mode === 'live' && auth) {
      void fetchAccounts(auth.token, auth.tenantId).then(setAccounts).catch(() => setAccounts(DEMO_ACCOUNTS))
    }
  }, [mode, auth])

  function loadBillLinesFromPo(poId: string) {
    const po = state.purchaseOrders.find((p) => p.id === poId)
    if (!po) return
    setBillVendor(po.vendorId)
    setBillLines(po.lines.map((l) => ({
      description: state.products.find((p) => p.id === l.productId)?.name ?? 'PO line',
      productId: l.productId,
      qty: String(l.qty),
      unitCost: String(l.unitCost),
    })))
  }

  async function onCreateBill(e: FormEvent) {
    e.preventDefault()
    const vendorId = billVendor || defaultVendor
    const lines: VendorBillLine[] = billLines
      .map((l) => {
        const qty = Number(l.qty) || 1
        const unitCost = Number(l.unitCost) || 0
        return {
          description: l.description || undefined,
          productId: l.productId || undefined,
          qty,
          unitCost,
          lineAmount: qty * unitCost,
          poLineItemId: billPo ? state.purchaseOrders.find((p) => p.id === billPo)?.lines.find((pl) => pl.productId === l.productId)?.id : undefined,
        }
      })
      .filter((l) => l.lineAmount > 0)
    if (!vendorId || lines.length === 0) return
    const total = lines.reduce((s, l) => s + l.lineAmount, 0)
    await spineMutate(
      () => createBill(auth!.token, auth!.tenantId, {
        vendorId,
        lines,
        billNumber: billNumber || undefined,
        poId: billPo || undefined,
        dueDate: billDue || undefined,
        memo: billMemo || undefined,
      }),
      { type: 'CREATE_BILL', vendorId, amount: total, dueDate: billDue || undefined, memo: billMemo || undefined },
    )
    setBillMemo('')
    setBillNumber('')
  }

  const payTotal = payAllocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)

  async function onRecordPayment(e: FormEvent) {
    e.preventDefault()
    const vendorId = payVendor || defaultVendor
    const allocations = payAllocations
      .map((a) => ({ billId: a.billId, amount: Number(a.amount) }))
      .filter((a) => a.billId && a.amount > 0)
    if (!vendorId || allocations.length === 0 || payTotal <= 0) return
    await spineMutate(
      () => recordPayment(auth!.token, auth!.tenantId, {
        vendorId,
        amount: payTotal,
        allocations,
        memo: payMemo || undefined,
      }),
      { type: 'PAY_BILL', billId: allocations[0].billId },
    )
    setPayAllocations([{ billId: '', amount: '' }])
    setPayMemo('')
  }

  async function onCreateClaim(e: FormEvent) {
    e.preventDefault()
    const amount = Number(claimAmount)
    if (!claimVendor.trim() || !amount) return
    const cat = EXPENSE_CATEGORIES.find((c) => c.code === claimCategory)
    await spineMutate(
      () => createExpenseClaim(auth!.token, auth!.tenantId, {
        vendorName: claimVendor.trim(),
        amount,
        categoryAccountCode: claimCategory,
        autoApprove: claimAutoApprove,
      }),
      {
        type: 'CREATE_EXPENSE_CLAIM',
        vendorName: claimVendor.trim(),
        amount,
        category: cat?.label ?? 'General Expense',
        autoApprove: claimAutoApprove,
      },
    )
    setClaimVendor('')
    setClaimAmount('')
  }

  async function onCreateJournal(e: FormEvent) {
    e.preventDefault()
    if (!jeMemo.trim()) return
    const lines = jeLines
      .map((l) => ({
        accountCode: l.accountCode,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }))
      .filter((l) => l.debit > 0 || l.credit > 0)
    if (lines.length < 2) return
    const debitTotal = lines.reduce((s, l) => s + l.debit, 0)
    const creditTotal = lines.reduce((s, l) => s + l.credit, 0)
    if (Math.abs(debitTotal - creditTotal) > 0.001) {
      dispatch({ type: 'SET_TOAST', message: `Entry does not balance: debits $${debitTotal.toFixed(2)} vs credits $${creditTotal.toFixed(2)}` })
      return
    }
    const demoLines = lines.map((l) => {
      const acct = accounts.find((a) => a.code === l.accountCode)
      return { account: acct?.name ?? l.accountCode, debit: l.debit, credit: l.credit }
    })
    await spineMutate(
      () => createJournalEntry(auth!.token, auth!.tenantId, { memo: jeMemo.trim(), lines }),
      { type: 'CREATE_JOURNAL', memo: jeMemo.trim(), lines: demoLines },
    )
    setJeMemo('')
    setJeLines([
      { accountCode: '1200', debit: '', credit: '' },
      { accountCode: '2000', debit: '', credit: '' },
    ])
  }

  function updateJeLine(idx: number, patch: Partial<JournalLineDraft>) {
    setJeLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const jeDebit = jeLines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const jeCredit = jeLines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const jeBalanced = Math.abs(jeDebit - jeCredit) < 0.001 && jeDebit > 0

  return (
    <div className="space-y-6">
      <SectionTitle sub="Finance spine — bills, payments, claims, and journal entries flow from inventory events.">
        Finance
      </SectionTitle>

      <SubTabs tabs={FIN_TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Cash" value={`$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="text-emerald-600" />
            <Stat label="Revenue (30d)" value={`$${revenue30d.toLocaleString()}`} />
            <Stat label="Expenses (30d)" value={`$${expenses30d.toLocaleString()}`} />
            <Stat label="AP outstanding" value={`$${unpaidTotal.toLocaleString()}`} sub={`${openBills.length} open bills`} tone="text-amber-600" />
          </div>
          <p className="text-sm text-slate-500">
            Use the tabs above to record bills, payments, expense claims, or manual journal entries — each type has its own form and history.
          </p>
        </div>
      )}

      {tab === 'bills' && (
        <div className="space-y-4">
          <form onSubmit={onCreateBill}>
            <FormPanel title="Add vendor bill (header + lines)">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Vendor">
                  <Select value={billVendor || defaultVendor} onChange={(e) => setBillVendor(e.target.value)}>
                    {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </Select>
                </Field>
                <Field label="Link to PO">
                  <Select value={billPo} onChange={(e) => { setBillPo(e.target.value); if (e.target.value) loadBillLinesFromPo(e.target.value) }}>
                    <option value="">— none —</option>
                    {state.purchaseOrders.map((po) => (
                      <option key={po.id} value={po.id}>{po.poNumber ?? po.id.slice(0, 8)} ({po.status})</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Bill number">
                  <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="INV-1234" />
                </Field>
                <Field label="Due date">
                  <Input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} />
                </Field>
              </div>
              <Field label="Memo">
                <Input value={billMemo} onChange={(e) => setBillMemo(e.target.value)} placeholder="Vendor invoice memo" />
              </Field>
              <div className="space-y-2">
                {billLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_72px_88px_auto] gap-2 items-end">
                    <Field label={i === 0 ? 'Line description' : ''}>
                      <Input value={line.description} onChange={(e) => setBillLines((rows) => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
                    </Field>
                    <Field label={i === 0 ? 'Qty' : ''}>
                      <Input type="number" step="0.001" value={line.qty} onChange={(e) => setBillLines((rows) => rows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))} />
                    </Field>
                    <Field label={i === 0 ? 'Unit cost' : ''}>
                      <Input type="number" step="0.01" value={line.unitCost} onChange={(e) => setBillLines((rows) => rows.map((r, j) => j === i ? { ...r, unitCost: e.target.value } : r))} />
                    </Field>
                    {billLines.length > 1 && (
                      <Button type="button" variant="ghost" onClick={() => setBillLines((rows) => rows.filter((_, j) => j !== i))}>×</Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="ghost" onClick={() => setBillLines((rows) => [...rows, { description: '', productId: '', qty: '1', unitCost: '' }])}>+ line</Button>
              </div>
              <p className="text-xs text-slate-500">
                Total: ${billLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0).toFixed(2)}
              </p>
              <Button type="submit" className="w-full">Create bill</Button>
            </FormPanel>
          </form>

          <div className="space-y-2.5">
            {state.bills.length === 0 ? (
              <Card className="p-4 text-sm text-slate-400">No bills yet.</Card>
            ) : state.bills.map((b) => {
              const days = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000)
              return (
                <Card key={b.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{b.billNumber ?? b.id.slice(0, 8) + '…'}</span>
                    {b.poNumber && <Badge tone="sky">PO {b.poNumber}</Badge>}
                    <Badge tone={b.status === 'paid' ? 'emerald' : b.status === 'partially_paid' ? 'sky' : days <= 3 ? 'rose' : 'amber'}>
                      {b.status === 'paid' ? 'paid' : b.status === 'partially_paid' ? `partially paid ($${(b.amountPaid ?? 0).toFixed(0)}/${b.amount.toFixed(0)})` : `due ${days >= 0 ? `in ${days}d` : `${-days}d ago`}`}
                    </Badge>
                    <span className="text-sm text-slate-600">{vendorName(b.vendorId)} — {b.memo}</span>
                    <span className="ml-auto text-sm font-semibold">${b.amount.toFixed(2)}</span>
                    {b.status !== 'paid' && !b.anomaly && can('finance.pay_bill') && (
                      <Button variant="secondary" onClick={() => dispatch({ type: 'PAY_BILL', billId: b.id })}>Pay</Button>
                    )}
                  </div>
                  {b.lines && b.lines.length > 0 && (
                    <table className="mt-2 w-full text-xs text-slate-600">
                      <tbody>
                        {b.lines.map((l) => (
                          <tr key={l.id ?? l.lineNumber} className="border-t border-slate-50">
                            <td className="py-1">{l.description ?? 'Line'}</td>
                            <td className="py-1 text-right">{l.qty} × ${l.unitCost.toFixed(2)}</td>
                            <td className="py-1 text-right font-medium">${l.lineAmount.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {b.payments && b.payments.length > 0 && (
                    <div className="mt-1 text-xs text-slate-500">
                      Payments: {b.payments.map((p) => `$${p.amount.toFixed(2)}`).join(', ')}
                    </div>
                  )}
                  {b.anomaly && can('finance.approve_claim') && (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2">
                      <span className="text-sm text-rose-700">⚠ {b.anomaly}</span>
                      <Button variant="secondary" onClick={() => dispatch({ type: 'APPROVE_BILL_ANOMALY', billId: b.id })}>
                        Reviewed — approve
                      </Button>
                    </div>
                  )}
                  {b.anomaly && !can('finance.approve_claim') && (
                    <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">⚠ {b.anomaly}</div>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-4">
          {can('finance.pay_bill') && (
          <form onSubmit={onRecordPayment}>
            <FormPanel title="Record payment (multi-bill allocations)">
              <Field label="Vendor">
                <Select value={payVendor || defaultVendor} onChange={(e) => setPayVendor(e.target.value)}>
                  {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <div className="space-y-2">
                {payAllocations.map((row, i) => {
                  const bill = openBills.find((b) => b.id === row.billId) ?? openBills[0]
                  const remaining = bill ? bill.amount - (bill.amountPaid ?? 0) : 0
                  return (
                    <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-2 items-end">
                      <Field label={i === 0 ? 'Bill' : ''}>
                        <Select value={row.billId || bill?.id || ''} onChange={(e) => setPayAllocations((rows) => rows.map((r, j) => j === i ? { ...r, billId: e.target.value, amount: r.amount || String(remaining) } : r))}>
                          {openBills.length === 0 ? <option value="">No open bills</option> : openBills.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.billNumber ?? b.id.slice(0, 8)} — ${b.amount.toFixed(2)} ({b.status}, due ${(b.amount - (b.amountPaid ?? 0)).toFixed(2)})
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={i === 0 ? 'Amount' : ''}>
                        <Input type="number" step="0.01" value={row.amount} onChange={(e) => setPayAllocations((rows) => rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))} placeholder={String(remaining)} />
                      </Field>
                      {payAllocations.length > 1 && (
                        <Button type="button" variant="ghost" onClick={() => setPayAllocations((rows) => rows.filter((_, j) => j !== i))}>×</Button>
                      )}
                    </div>
                  )
                })}
                <Button type="button" variant="ghost" onClick={() => setPayAllocations((rows) => [...rows, { billId: openBills[0]?.id ?? '', amount: '' }])}>+ allocation</Button>
              </div>
              <Field label="Memo">
                <Input value={payMemo} onChange={(e) => setPayMemo(e.target.value)} placeholder="Check #1234" />
              </Field>
              <p className="text-xs text-slate-500">Payment total: ${payTotal.toFixed(2)}</p>
              <Button type="submit" className="w-full" disabled={openBills.length === 0 || payTotal <= 0}>Record payment</Button>
            </FormPanel>
          </form>
          )}

          <div className="space-y-2.5">
            {state.payments.length === 0 ? (
              <Card className="p-4 text-sm text-slate-400">No payments recorded yet.</Card>
            ) : state.payments.map((p) => (
              <Card key={p.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">{p.id.slice(0, 8)}…</span>
                  <Badge tone="slate">{p.method}</Badge>
                  <span>{vendorName(p.vendorId)}</span>
                  <span className="ml-auto font-semibold">${p.amount.toFixed(2)}</span>
                  <span className="text-xs text-slate-400">{timeAgo(p.paidAt)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {p.allocations.map((a) => `${a.billNumber ?? a.billId.slice(0, 8)}: $${a.amount.toFixed(2)}`).join(' · ')}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'claims' && (
        <div className="space-y-4">
          <form onSubmit={onCreateClaim} className="max-w-md">
            <FormPanel title="Expense claim">
              <Field label="Vendor / payee">
                <Input value={claimVendor} onChange={(e) => setClaimVendor(e.target.value)} placeholder="FedEx" required />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount">
                  <Input type="number" step="0.01" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} required />
                </Field>
                <Field label="Category">
                  <Select value={claimCategory} onChange={(e) => setClaimCategory(e.target.value)}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </Select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={claimAutoApprove} onChange={(e) => setClaimAutoApprove(e.target.checked)} disabled={!can('finance.approve_claim')} />
                Approve immediately (posts to journal)
              </label>
              <Button type="submit" className="w-full">Submit claim</Button>
            </FormPanel>
          </form>

          <div className="space-y-2.5">
            {state.claims.length === 0 ? (
              <Card className="p-4 text-sm text-slate-400">No expense claims yet.</Card>
            ) : state.claims.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{c.id.slice(0, 8)}…</span>
                  <Badge tone={c.status === 'approved' ? 'emerald' : c.status === 'rejected' ? 'rose' : 'amber'}>{c.status.replace(/_/g, ' ')}</Badge>
                  <span className="text-sm text-slate-600">{c.vendorName} → {c.category}</span>
                  <ConfidenceBadge value={c.confidence} />
                  <span className="ml-auto text-sm font-semibold">${c.amount.toFixed(2)}</span>
                  {c.status === 'pending_review' && can('finance.approve_claim') && (
                    <>
                      <Button variant="secondary" onClick={() => dispatch({ type: 'APPROVE_CLAIM', claimId: c.id })}>Approve</Button>
                      <Button variant="ghost" onClick={() => dispatch({ type: 'REJECT_CLAIM', claimId: c.id })}>Reject</Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div className="space-y-4">
          {can('finance.post_journal') && (
          <form onSubmit={onCreateJournal}>
            <FormPanel title="Journal entry">
              <Field label="Memo">
                <Input value={jeMemo} onChange={(e) => setJeMemo(e.target.value)} placeholder="Opening balance adjustment" required />
              </Field>
              <div className="space-y-2">
                {jeLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-end">
                    <Field label={i === 0 ? 'Account' : ''}>
                      <Select value={line.accountCode} onChange={(e) => updateJeLine(i, { accountCode: e.target.value })}>
                        {accounts.map((a) => (
                          <option key={a.code} value={a.code}>{a.code} {a.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={i === 0 ? 'Debit' : ''}>
                      <Input type="number" step="0.01" min={0} value={line.debit} onChange={(e) => updateJeLine(i, { debit: e.target.value })} />
                    </Field>
                    <Field label={i === 0 ? 'Credit' : ''}>
                      <Input type="number" step="0.01" min={0} value={line.credit} onChange={(e) => updateJeLine(i, { credit: e.target.value })} />
                    </Field>
                    {jeLines.length > 2 && (
                      <Button type="button" variant="ghost" onClick={() => setJeLines((rows) => rows.filter((_, j) => j !== i))}>×</Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Debits ${jeDebit.toFixed(2)} · Credits ${jeCredit.toFixed(2)}
                  {!jeBalanced && jeDebit + jeCredit > 0 && <span className="ml-2 text-rose-600">must balance</span>}
                </span>
                <Button type="button" variant="ghost" onClick={() => setJeLines((rows) => [...rows, { accountCode: '6900', debit: '', credit: '' }])}>
                  + line
                </Button>
              </div>
              <Button type="submit" className="w-full" disabled={!jeBalanced}>Post journal entry</Button>
            </FormPanel>
          </form>
          )}

          <div className="space-y-2.5">
            {state.journal.length === 0 ? (
              <Card className="p-4 text-sm text-slate-400">No journal entries yet.</Card>
            ) : state.journal.map((je) => (
              <Card key={je.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{je.id.slice(0, 8)}…</span>
                  <Badge tone="slate">{SOURCE_LABEL[je.source]}</Badge>
                  {je.autoPosted && <Badge tone="indigo">✦ auto-posted</Badge>}
                  <span className="text-sm text-slate-600">{je.memo}</span>
                  <span className="ml-auto text-xs text-slate-400">{timeAgo(je.at)}</span>
                </div>
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {je.lines.map((l, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="py-1 text-slate-600">{l.account}</td>
                        <td className="py-1 text-right font-mono text-xs text-slate-500">{l.debit > 0 ? `$${l.debit.toFixed(2)}` : ''}</td>
                        <td className="py-1 text-right font-mono text-xs text-slate-400">{l.credit > 0 ? `$${l.credit.toFixed(2)}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
