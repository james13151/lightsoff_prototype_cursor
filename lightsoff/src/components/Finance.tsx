import { useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import { cashPosition } from '../ai/digest'
import {
  createBill, createExpenseClaim, createJournalEntry, EXPENSE_CATEGORIES,
  fetchAccounts, recordPayment, type AccountOption,
} from '../api/mutations'
import {
  Badge, Button, Card, ConfidenceBadge, Field, FormPanel, Input, SectionTitle, Select, Stat, timeAgo,
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

interface JournalLineDraft {
  accountCode: string
  debit: string
  credit: string
}

export function Finance() {
  const { state, dispatch, spineMutate, auth, mode } = useStore()
  const { cash, revenue30d, expenses30d } = cashPosition(state)
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? '—'
  const unpaidTotal = state.bills
    .filter((b) => b.status === 'unpaid' || b.status === 'partially_paid')
    .reduce((s, b) => s + b.amount - (b.amountPaid ?? 0), 0)

  const [accounts, setAccounts] = useState<AccountOption[]>(DEMO_ACCOUNTS)
  const [billVendor, setBillVendor] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [billDue, setBillDue] = useState('')
  const [billMemo, setBillMemo] = useState('')
  const [payBill, setPayBill] = useState('')
  const [payAmount, setPayAmount] = useState('')
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

  async function onCreateBill(e: FormEvent) {
    e.preventDefault()
    const vendorId = billVendor || defaultVendor
    const amount = Number(billAmount)
    if (!vendorId || !amount) return
    await spineMutate(
      () => createBill(auth!.token, auth!.tenantId, {
        vendorId,
        amount,
        dueDate: billDue || undefined,
        memo: billMemo || undefined,
      }),
      { type: 'CREATE_BILL', vendorId, amount, dueDate: billDue || undefined, memo: billMemo || undefined },
    )
    setBillAmount('')
    setBillMemo('')
  }

  async function onRecordPayment(e: FormEvent) {
    e.preventDefault()
    const bill = state.bills.find((b) => b.id === payBill)
    if (!bill) return
    const amount = Number(payAmount) || bill.amount - (bill.amountPaid ?? 0)
    await spineMutate(
      () => recordPayment(auth!.token, auth!.tenantId, {
        vendorId: bill.vendorId,
        amount,
        billId: bill.id,
      }),
      { type: 'PAY_BILL', billId: bill.id },
    )
    setPayAmount('')
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
    <div className="space-y-8">
      <div>
        <SectionTitle sub="Computed live from the journal — no separate reporting layer, no shadow ledgers in other modules.">
          Cash & P&L
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Cash" value={`$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="text-emerald-600" />
          <Stat label="Revenue (30d)" value={`$${revenue30d.toLocaleString()}`} />
          <Stat label="Expenses (30d)" value={`$${expenses30d.toLocaleString()}`} />
          <Stat label="AP outstanding" value={`$${unpaidTotal.toLocaleString()}`} sub={`${openBills.length} open bills`} tone="text-amber-600" />
        </div>
      </div>

      <div>
        <SectionTitle sub="Record bills, payments, expense claims, and manual journal entries.">
          Quick actions
        </SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          <form onSubmit={onCreateBill}>
            <FormPanel title="Add vendor bill">
              <Field label="Vendor">
                <Select value={billVendor || defaultVendor} onChange={(e) => setBillVendor(e.target.value)}>
                  {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amount">
                  <Input type="number" step="0.01" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} required />
                </Field>
                <Field label="Due date">
                  <Input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} />
                </Field>
              </div>
              <Field label="Memo">
                <Input value={billMemo} onChange={(e) => setBillMemo(e.target.value)} placeholder="INV-1234" />
              </Field>
              <Button type="submit" className="w-full">Create bill</Button>
            </FormPanel>
          </form>

          <form onSubmit={onRecordPayment}>
            <FormPanel title="Record payment">
              <Field label="Bill">
                <Select value={payBill || openBills[0]?.id || ''} onChange={(e) => setPayBill(e.target.value)} required>
                  {openBills.length === 0 ? (
                    <option value="">No open bills</option>
                  ) : openBills.map((b) => (
                    <option key={b.id} value={b.id}>
                      {vendorName(b.vendorId)} — ${b.amount.toFixed(2)} ({b.status})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount (defaults to remaining balance)">
                <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="full balance" />
              </Field>
              <Button type="submit" className="w-full" disabled={openBills.length === 0}>Record payment</Button>
            </FormPanel>
          </form>

          <form onSubmit={onCreateClaim}>
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
                <input type="checkbox" checked={claimAutoApprove} onChange={(e) => setClaimAutoApprove(e.target.checked)} />
                Approve immediately (posts to journal)
              </label>
              <Button type="submit" className="w-full">Submit claim</Button>
            </FormPanel>
          </form>

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
        </div>
      </div>

      <div>
        <SectionTitle sub="Auto-created from Inventory's PO/receipt flow. Anomalies (new vendor, unusual amount) are held — recurring vendors auto-post.">
          Vendor bills
        </SectionTitle>
        <div className="space-y-2.5">
          {state.bills.length === 0 ? (
            <Card className="p-4 text-sm text-slate-400">No bills yet.</Card>
          ) : state.bills.map((b) => {
            const days = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000)
            return (
              <Card key={b.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{b.id.slice(0, 8)}…</span>
                  <Badge tone={b.status === 'paid' ? 'emerald' : b.status === 'partially_paid' ? 'sky' : days <= 3 ? 'rose' : 'amber'}>
                    {b.status === 'paid' ? 'paid' : b.status === 'partially_paid' ? `partially paid ($${(b.amountPaid ?? 0).toFixed(0)}/${b.amount.toFixed(0)})` : `due ${days >= 0 ? `in ${days}d` : `${-days}d ago`}`}
                  </Badge>
                  <span className="text-sm text-slate-600">{vendorName(b.vendorId)} — {b.memo}</span>
                  <span className="ml-auto text-sm font-semibold">${b.amount.toFixed(2)}</span>
                  {b.status !== 'paid' && !b.anomaly && (
                    <Button variant="secondary" onClick={() => dispatch({ type: 'PAY_BILL', billId: b.id })}>Pay</Button>
                  )}
                </div>
                {b.anomaly && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2">
                    <span className="text-sm text-rose-700">⚠ {b.anomaly}</span>
                    <Button variant="secondary" onClick={() => dispatch({ type: 'APPROVE_BILL_ANOMALY', billId: b.id })}>
                      Reviewed — approve
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      <div>
        <SectionTitle sub="AI extracts vendor, amount, and category from receipt photos. Above your confidence threshold they auto-apply with an undo window; below it they route to a Collab approval ticket.">
          Expense claims (petty cash)
        </SectionTitle>
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
                {c.status === 'pending_review' && (
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

      <div>
        <SectionTitle sub="Double-entry, auto-posted from other modules' events. This is the single ledger every cost and revenue event flows into.">
          Journal
        </SectionTitle>
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
    </div>
  )
}
