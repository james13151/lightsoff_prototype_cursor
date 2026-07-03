import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useStore } from '../store'
import { cashPosition } from '../ai/digest'
import {
  createAccount, createBill, createExpenseClaim, createJournalEntry,
  fetchAccounts, recordPayment, updateAccount, type AccountOption,
} from '../api/mutations'
import { useListFilter } from '../lib/useListFilter'
import type { VendorBillLine } from '../types'
import {
  Badge, Button, Card, ConfidenceBadge, Field, FormPanel, Input, ListRow, ListToolbar,
  Modal, SectionTitle, Select, Stat, SubTabs, timeAgo,
} from './ui'

const SOURCE_LABEL: Record<string, string> = {
  inventory_ap: 'Inventory AP event',
  ad_spend: 'Marketing ad spend',
  shopify_revenue: 'Shopify payout',
  expense_claim: 'Expense claim',
  manual: 'Manual entry',
}

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const

const DEMO_ACCOUNTS: AccountOption[] = [
  { id: '1000', code: '1000', name: 'Cash', type: 'asset', isSystem: true },
  { id: '1100', code: '1100', name: 'Petty Cash', type: 'asset', isSystem: true },
  { id: '1200', code: '1200', name: 'Inventory', type: 'asset', isSystem: true },
  { id: '2000', code: '2000', name: 'Accounts Payable', type: 'liability', isSystem: true },
  { id: '3000', code: '3000', name: 'Owner Equity', type: 'equity', isSystem: true },
  { id: '4000', code: '4000', name: 'Sales Revenue', type: 'revenue', isSystem: true },
  { id: '5000', code: '5000', name: 'Cost of Goods Sold', type: 'expense', isSystem: true },
  { id: '6900', code: '6900', name: 'General Expense', type: 'expense', isSystem: true },
]

interface JournalLineDraft {
  accountCode: string
  debit: string
  credit: string
}

type FinTab = 'overview' | 'accounts' | 'bills' | 'payments' | 'claims' | 'journal'
type FinModal = 'bill' | 'payment' | 'claim' | 'journal' | 'account' | null

const FIN_TABS: { id: FinTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'accounts', label: 'Chart of accounts' },
  { id: 'bills', label: 'Bills' },
  { id: 'payments', label: 'Payments' },
  { id: 'claims', label: 'Claims' },
  { id: 'journal', label: 'Journal' },
]

function formatBalance(type: string, netDebit: number): string {
  const n = type === 'liability' || type === 'revenue' || type === 'equity' ? -netDebit : netDebit
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function Finance() {
  const { state, dispatch, spineMutate, auth, mode, can } = useStore()
  const [tab, setTab] = useState<FinTab>('overview')
  const [modal, setModal] = useState<FinModal>(null)
  const [editAccountId, setEditAccountId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const { cash, revenue30d, expenses30d } = cashPosition(state)
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? '—'
  const unpaidTotal = state.bills
    .filter((b) => b.status === 'unpaid' || b.status === 'partially_paid')
    .reduce((s, b) => s + b.amount - (b.amountPaid ?? 0), 0)

  const [accounts, setAccounts] = useState<AccountOption[]>(DEMO_ACCOUNTS)
  const expenseAccounts = accounts.filter((a) => a.type === 'expense')

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
  const [claimCategory, setClaimCategory] = useState('6900')
  const [claimAutoApprove, setClaimAutoApprove] = useState(true)
  const [jeMemo, setJeMemo] = useState('')
  const [jeLines, setJeLines] = useState<JournalLineDraft[]>([
    { accountCode: '1200', debit: '', credit: '' },
    { accountCode: '2000', debit: '', credit: '' },
  ])
  const [acctCode, setAcctCode] = useState('')
  const [acctName, setAcctName] = useState('')
  const [acctType, setAcctType] = useState<string>('expense')

  const defaultVendor = state.vendors[0]?.id ?? ''
  const openBills = state.bills.filter((b) => b.status !== 'paid')

  async function reloadAccounts() {
    if (mode === 'live' && auth) {
      const rows = await fetchAccounts(auth.token, auth.tenantId)
      setAccounts(rows)
      return rows
    }
    return accounts
  }

  useEffect(() => {
    void reloadAccounts().catch(() => setAccounts(DEMO_ACCOUNTS))
  }, [mode, auth])

  useEffect(() => {
    if (expenseAccounts.length > 0 && !expenseAccounts.some((a) => a.code === claimCategory)) {
      setClaimCategory(expenseAccounts[0].code)
    }
  }, [expenseAccounts, claimCategory])

  function closeModal() {
    setModal(null)
    setEditAccountId(null)
  }

  function openCreate(kind: FinModal) {
    setSearch('')
    setModal(kind)
    if (kind === 'account') {
      setEditAccountId(null)
      setAcctCode('')
      setAcctName('')
      setAcctType('expense')
    }
  }

  function openEditAccount(a: AccountOption) {
    setEditAccountId(a.id)
    setAcctCode(a.code)
    setAcctName(a.name)
    setAcctType(a.type)
    setModal('account')
  }

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
        vendorId, lines, billNumber: billNumber || undefined, poId: billPo || undefined,
        dueDate: billDue || undefined, memo: billMemo || undefined,
      }),
      { type: 'CREATE_BILL', vendorId, amount: total, dueDate: billDue || undefined, memo: billMemo || undefined },
    )
    setBillMemo('')
    setBillNumber('')
    closeModal()
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
      () => recordPayment(auth!.token, auth!.tenantId, { vendorId, amount: payTotal, allocations, memo: payMemo || undefined }),
      { type: 'PAY_BILL', billId: allocations[0].billId },
    )
    setPayAllocations([{ billId: '', amount: '' }])
    setPayMemo('')
    closeModal()
  }

  async function onCreateClaim(e: FormEvent) {
    e.preventDefault()
    const amount = Number(claimAmount)
    if (!claimVendor.trim() || !amount) return
    const cat = expenseAccounts.find((c) => c.code === claimCategory)
    await spineMutate(
      () => createExpenseClaim(auth!.token, auth!.tenantId, {
        vendorName: claimVendor.trim(), amount, categoryAccountCode: claimCategory, autoApprove: claimAutoApprove,
      }),
      { type: 'CREATE_EXPENSE_CLAIM', vendorName: claimVendor.trim(), amount, category: cat?.name ?? 'General Expense', autoApprove: claimAutoApprove },
    )
    setClaimVendor('')
    setClaimAmount('')
    closeModal()
  }

  async function onCreateJournal(e: FormEvent) {
    e.preventDefault()
    if (!jeMemo.trim()) return
    const lines = jeLines
      .map((l) => ({ accountCode: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }))
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
    setJeLines([{ accountCode: '1200', debit: '', credit: '' }, { accountCode: '2000', debit: '', credit: '' }])
    closeModal()
  }

  async function onSaveAccount(e: FormEvent) {
    e.preventDefault()
    if (!acctName.trim()) return
    if (editAccountId) {
      if (mode === 'live' && auth) {
        await updateAccount(auth.token, editAccountId, { name: acctName.trim(), type: acctType })
        await reloadAccounts()
      } else {
        setAccounts((rows) => rows.map((a) => a.id === editAccountId ? { ...a, name: acctName.trim(), type: acctType } : a))
      }
    } else {
      if (!/^[0-9]{4}$/.test(acctCode.trim())) {
        dispatch({ type: 'SET_TOAST', message: 'Account code must be 4 digits (e.g. 7100)' })
        return
      }
      if (mode === 'live' && auth) {
        await createAccount(auth.token, auth.tenantId, { code: acctCode.trim(), name: acctName.trim(), type: acctType })
        await reloadAccounts()
      } else {
        setAccounts((rows) => [...rows, { id: acctCode, code: acctCode.trim(), name: acctName.trim(), type: acctType, isSystem: false }])
      }
    }
    closeModal()
  }

  function updateJeLine(idx: number, patch: Partial<JournalLineDraft>) {
    setJeLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const jeDebit = jeLines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
  const jeCredit = jeLines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
  const jeBalanced = Math.abs(jeDebit - jeCredit) < 0.001 && jeDebit > 0

  const matchBill = useCallback((b: typeof state.bills[0], q: string) =>
    [b.billNumber, b.memo, vendorName(b.vendorId), b.status].some((s) => String(s ?? '').toLowerCase().includes(q)),
  [state.vendors])

  const filteredBills = useListFilter(state.bills, search, matchBill).filter((b) =>
    statusFilter === 'all' ? true : statusFilter === 'open' ? b.status !== 'paid' : b.status === statusFilter,
  )

  const filteredPayments = useListFilter(state.payments, search, useCallback((p, q) =>
    [p.id, vendorName(p.vendorId), p.method, p.memo].some((s) => String(s ?? '').toLowerCase().includes(q)), [state.vendors]))

  const filteredClaims = useListFilter(state.claims, search, useCallback((c, q) =>
    [c.vendorName, c.category, c.status].some((s) => String(s ?? '').toLowerCase().includes(q)), []))
    .filter((c) => statusFilter === 'all' ? true : c.status === statusFilter)

  const filteredJournal = useListFilter(state.journal, search, useCallback((je, q) =>
    [je.memo, je.source, ...je.lines.map((l) => l.account)].some((s) => String(s ?? '').toLowerCase().includes(q)), []))

  const filteredAccounts = useListFilter(accounts, search, useCallback((a, q) =>
    [a.code, a.name, a.type].some((s) => String(s ?? '').toLowerCase().includes(q)), []))
    .filter((a) => statusFilter === 'all' ? true : a.type === statusFilter)

  const tabAction = (() => {
    if (tab === 'bills') return <Button variant="secondary" onClick={() => openCreate('bill')}>+</Button>
    if (tab === 'payments' && can('finance.pay_bill')) return <Button variant="secondary" onClick={() => openCreate('payment')}>+</Button>
    if (tab === 'claims') return <Button variant="secondary" onClick={() => openCreate('claim')}>+</Button>
    if (tab === 'journal' && can('finance.post_journal')) return <Button variant="secondary" onClick={() => openCreate('journal')}>+</Button>
    if (tab === 'accounts' && can('finance.post_journal')) return <Button variant="secondary" onClick={() => openCreate('account')}>+</Button>
    return undefined
  })()

  return (
    <div className="space-y-4">
      <SectionTitle sub="Finance spine — bills, payments, claims, and journal entries flow from inventory events.">
        Finance
      </SectionTitle>

      <SubTabs tabs={FIN_TABS} active={tab} onChange={(t) => { setTab(t); setSearch(''); setStatusFilter('all') }} action={tabAction} />

      {tab === 'overview' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Cash" value={`$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="text-emerald-600" />
            <Stat label="Revenue (30d)" value={`$${revenue30d.toLocaleString()}`} />
            <Stat label="Expenses (30d)" value={`$${expenses30d.toLocaleString()}`} />
            <Stat label="AP outstanding" value={`$${unpaidTotal.toLocaleString()}`} sub={`${openBills.length} open bills`} tone="text-amber-600" />
          </div>
          <p className="text-sm text-slate-500">Use the tabs to browse records. Click <strong>+</strong> on a tab to create a new bill, payment, claim, or journal entry.</p>
        </div>
      )}

      {tab === 'accounts' && (
        <div className="space-y-2">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search code, name, type…"
            count={filteredAccounts.length}
            filters={
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[140px]">
                <option value="all">All types</option>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            }
          />
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium text-right">Balance</th>
                  <th className="px-3 py-2 font-medium w-16" />
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">No accounts match.</td></tr>
                ) : filteredAccounts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-1.5 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-1.5">{a.name}{a.isSystem ? <span className="ml-1.5"><Badge tone="slate">system</Badge></span> : null}</td>
                    <td className="px-3 py-1.5 text-slate-500">{a.type}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs">{formatBalance(a.type, a.netDebit ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {!a.isSystem && can('finance.post_journal') && (
                        <Button variant="ghost" onClick={() => openEditAccount(a)}>Edit</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'bills' && (
        <div className="space-y-2">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search bills…"
            count={filteredBills.length}
            filters={
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[130px]">
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </Select>
            }
          />
          <div className="space-y-1.5">
            {filteredBills.length === 0 ? (
              <Card className="p-3 text-sm text-slate-400">No bills yet. Click + to add one.</Card>
            ) : filteredBills.map((b) => {
              const days = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000)
              return (
                <ListRow key={b.id}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold">{b.billNumber ?? b.id.slice(0, 8) + '…'}</span>
                    {b.poNumber && <Badge tone="sky">PO {b.poNumber}</Badge>}
                    <Badge tone={b.status === 'paid' ? 'emerald' : b.status === 'partially_paid' ? 'sky' : days <= 3 ? 'rose' : 'amber'}>
                      {b.status === 'paid' ? 'paid' : b.status === 'partially_paid' ? `partial ($${(b.amountPaid ?? 0).toFixed(0)})` : `due ${days >= 0 ? `${days}d` : `${-days}d ago`}`}
                    </Badge>
                    <span className="text-xs text-slate-600">{vendorName(b.vendorId)}{b.memo ? ` — ${b.memo}` : ''}</span>
                    <span className="ml-auto text-sm font-semibold">${b.amount.toFixed(2)}</span>
                    {b.status !== 'paid' && !b.anomaly && can('finance.pay_bill') && (
                      <Button variant="secondary" onClick={() => dispatch({ type: 'PAY_BILL', billId: b.id })}>Pay</Button>
                    )}
                  </div>
                  {b.anomaly && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">
                      <span>⚠ {b.anomaly}</span>
                      {can('finance.approve_claim') && (
                        <Button variant="secondary" onClick={() => dispatch({ type: 'APPROVE_BILL_ANOMALY', billId: b.id })}>Approve</Button>
                      )}
                    </div>
                  )}
                </ListRow>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-2">
          <ListToolbar search={search} onSearchChange={setSearch} placeholder="Search payments…" count={filteredPayments.length} />
          <div className="space-y-1.5">
            {filteredPayments.length === 0 ? (
              <Card className="p-3 text-sm text-slate-400">No payments yet.</Card>
            ) : filteredPayments.map((p) => (
              <ListRow key={p.id}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold">{p.id.slice(0, 8)}…</span>
                  <Badge tone="slate">{p.method}</Badge>
                  <span className="text-xs">{vendorName(p.vendorId)}</span>
                  <span className="ml-auto font-semibold">${p.amount.toFixed(2)}</span>
                  <span className="text-[11px] text-slate-400">{timeAgo(p.paidAt)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {p.allocations.map((a) => `${a.billNumber ?? a.billId.slice(0, 8)}: $${a.amount.toFixed(2)}`).join(' · ')}
                </div>
              </ListRow>
            ))}
          </div>
        </div>
      )}

      {tab === 'claims' && (
        <div className="space-y-2">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search claims…"
            count={filteredClaims.length}
            filters={
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[140px]">
                <option value="all">All</option>
                <option value="pending_review">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </Select>
            }
          />
          <div className="space-y-1.5">
            {filteredClaims.length === 0 ? (
              <Card className="p-3 text-sm text-slate-400">No expense claims yet.</Card>
            ) : filteredClaims.map((c) => (
              <ListRow key={c.id}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold">{c.id.slice(0, 8)}…</span>
                  <Badge tone={c.status === 'approved' ? 'emerald' : c.status === 'rejected' ? 'rose' : 'amber'}>{c.status.replace(/_/g, ' ')}</Badge>
                  <span className="text-xs text-slate-600">{c.vendorName} → {c.category}</span>
                  <ConfidenceBadge value={c.confidence} />
                  <span className="ml-auto text-sm font-semibold">${c.amount.toFixed(2)}</span>
                  {c.status === 'pending_review' && can('finance.approve_claim') && (
                    <>
                      <Button variant="secondary" onClick={() => dispatch({ type: 'APPROVE_CLAIM', claimId: c.id })}>Approve</Button>
                      <Button variant="ghost" onClick={() => dispatch({ type: 'REJECT_CLAIM', claimId: c.id })}>Reject</Button>
                    </>
                  )}
                </div>
              </ListRow>
            ))}
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div className="space-y-2">
          <ListToolbar search={search} onSearchChange={setSearch} placeholder="Search journal…" count={filteredJournal.length} />
          <div className="space-y-1.5">
            {filteredJournal.length === 0 ? (
              <Card className="p-3 text-sm text-slate-400">No journal entries yet.</Card>
            ) : filteredJournal.map((je) => (
              <ListRow key={je.id}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-semibold">{je.id.slice(0, 8)}…</span>
                  <Badge tone="slate">{SOURCE_LABEL[je.source]}</Badge>
                  {je.autoPosted && <Badge tone="indigo">auto</Badge>}
                  <span className="text-xs text-slate-600">{je.memo}</span>
                  <span className="ml-auto text-[11px] text-slate-400">{timeAgo(je.at)}</span>
                </div>
                <table className="mt-1 w-full text-xs">
                  <tbody>
                    {je.lines.map((l, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="py-0.5 text-slate-600">{l.account}</td>
                        <td className="py-0.5 text-right font-mono text-slate-500">{l.debit > 0 ? `$${l.debit.toFixed(2)}` : ''}</td>
                        <td className="py-0.5 text-right font-mono text-slate-400">{l.credit > 0 ? `$${l.credit.toFixed(2)}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ListRow>
            ))}
          </div>
        </div>
      )}

      <Modal open={modal === 'bill'} title="Add vendor bill" onClose={closeModal} wide>
        <form onSubmit={onCreateBill}>
          <FormPanel title="">
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
              <Field label="Bill number"><Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="INV-1234" /></Field>
              <Field label="Due date"><Input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} /></Field>
            </div>
            <Field label="Memo"><Input value={billMemo} onChange={(e) => setBillMemo(e.target.value)} /></Field>
            {billLines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_72px_88px_auto] gap-2 items-end">
                <Field label={i === 0 ? 'Description' : ''}>
                  <Input value={line.description} onChange={(e) => setBillLines((rows) => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
                </Field>
                <Field label={i === 0 ? 'Qty' : ''}>
                  <Input type="number" value={line.qty} onChange={(e) => setBillLines((rows) => rows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))} />
                </Field>
                <Field label={i === 0 ? 'Cost' : ''}>
                  <Input type="number" step="0.01" value={line.unitCost} onChange={(e) => setBillLines((rows) => rows.map((r, j) => j === i ? { ...r, unitCost: e.target.value } : r))} />
                </Field>
                {billLines.length > 1 && <Button type="button" variant="ghost" onClick={() => setBillLines((rows) => rows.filter((_, j) => j !== i))}>×</Button>}
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={() => setBillLines((rows) => [...rows, { description: '', productId: '', qty: '1', unitCost: '' }])}>+ line</Button>
            <Button type="submit" className="w-full">Create bill</Button>
          </FormPanel>
        </form>
      </Modal>

      <Modal open={modal === 'payment'} title="Record payment" onClose={closeModal} wide>
        <form onSubmit={onRecordPayment}>
          <FormPanel title="">
            <Field label="Vendor">
              <Select value={payVendor || defaultVendor} onChange={(e) => setPayVendor(e.target.value)}>
                {state.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </Field>
            {payAllocations.map((row, i) => {
              const bill = openBills.find((b) => b.id === row.billId) ?? openBills[0]
              const remaining = bill ? bill.amount - (bill.amountPaid ?? 0) : 0
              return (
                <div key={i} className="grid grid-cols-[1fr_100px_auto] gap-2 items-end">
                  <Field label={i === 0 ? 'Bill' : ''}>
                    <Select value={row.billId || bill?.id || ''} onChange={(e) => setPayAllocations((rows) => rows.map((r, j) => j === i ? { ...r, billId: e.target.value, amount: r.amount || String(remaining) } : r))}>
                      {openBills.map((b) => (
                        <option key={b.id} value={b.id}>{b.billNumber ?? b.id.slice(0, 8)} — ${(b.amount - (b.amountPaid ?? 0)).toFixed(2)} due</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={i === 0 ? 'Amount' : ''}>
                    <Input type="number" step="0.01" value={row.amount} onChange={(e) => setPayAllocations((rows) => rows.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))} />
                  </Field>
                  {payAllocations.length > 1 && <Button type="button" variant="ghost" onClick={() => setPayAllocations((rows) => rows.filter((_, j) => j !== i))}>×</Button>}
                </div>
              )
            })}
            <Field label="Memo"><Input value={payMemo} onChange={(e) => setPayMemo(e.target.value)} /></Field>
            <Button type="submit" className="w-full" disabled={openBills.length === 0}>Record ${payTotal.toFixed(2)}</Button>
          </FormPanel>
        </form>
      </Modal>

      <Modal open={modal === 'claim'} title="Expense claim" onClose={closeModal}>
        <form onSubmit={onCreateClaim}>
          <FormPanel title="">
            <Field label="Vendor / payee"><Input value={claimVendor} onChange={(e) => setClaimVendor(e.target.value)} required /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Amount"><Input type="number" step="0.01" value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)} required /></Field>
              <Field label="Category">
                <Select value={claimCategory} onChange={(e) => setClaimCategory(e.target.value)}>
                  {expenseAccounts.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={claimAutoApprove} onChange={(e) => setClaimAutoApprove(e.target.checked)} disabled={!can('finance.approve_claim')} />
              Approve immediately
            </label>
            <Button type="submit" className="w-full">Submit claim</Button>
          </FormPanel>
        </form>
      </Modal>

      <Modal open={modal === 'journal'} title="Journal entry" onClose={closeModal} wide>
        <form onSubmit={onCreateJournal}>
          <FormPanel title="">
            <Field label="Memo"><Input value={jeMemo} onChange={(e) => setJeMemo(e.target.value)} required /></Field>
            {jeLines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-end">
                <Field label={i === 0 ? 'Account' : ''}>
                  <Select value={line.accountCode} onChange={(e) => updateJeLine(i, { accountCode: e.target.value })}>
                    {accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                  </Select>
                </Field>
                <Field label={i === 0 ? 'Debit' : ''}><Input type="number" step="0.01" value={line.debit} onChange={(e) => updateJeLine(i, { debit: e.target.value })} /></Field>
                <Field label={i === 0 ? 'Credit' : ''}><Input type="number" step="0.01" value={line.credit} onChange={(e) => updateJeLine(i, { credit: e.target.value })} /></Field>
                {jeLines.length > 2 && <Button type="button" variant="ghost" onClick={() => setJeLines((rows) => rows.filter((_, j) => j !== i))}>×</Button>}
              </div>
            ))}
            <p className="text-xs text-slate-500">Debits ${jeDebit.toFixed(2)} · Credits ${jeCredit.toFixed(2)}{!jeBalanced && jeDebit + jeCredit > 0 && <span className="text-rose-600"> — must balance</span>}</p>
            <Button type="submit" className="w-full" disabled={!jeBalanced}>Post entry</Button>
          </FormPanel>
        </form>
      </Modal>

      <Modal open={modal === 'account'} title={editAccountId ? 'Edit account' : 'Add account'} onClose={closeModal}>
        <form onSubmit={onSaveAccount}>
          <FormPanel title="">
            <Field label="Code (4 digits)">
              <Input value={acctCode} onChange={(e) => setAcctCode(e.target.value)} placeholder="7100" required disabled={!!editAccountId} />
            </Field>
            <Field label="Name"><Input value={acctName} onChange={(e) => setAcctName(e.target.value)} required /></Field>
            <Field label="Type">
              <Select value={acctType} onChange={(e) => setAcctType(e.target.value)} disabled={!!editAccountId && accounts.find((a) => a.id === editAccountId)?.isSystem}>
                {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Button type="submit" className="w-full">{editAccountId ? 'Save' : 'Create account'}</Button>
          </FormPanel>
        </form>
      </Modal>
    </div>
  )
}
