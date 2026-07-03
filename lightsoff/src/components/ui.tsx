import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import type { Confidence } from '../types'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}>{children}</div>
  )
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-ink">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-ink-muted">{sub}</p>}
    </div>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-surface-2 text-ink-muted',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    indigo: 'bg-accent-soft text-accent',
    accent: 'bg-accent-soft text-accent',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-black/5 dark:ring-white/10 ${tones[tone] ?? tones.slate}`}>
      {children}
    </span>
  )
}

export function ConfidenceBadge({ value, threshold }: { value: Confidence; threshold?: number }) {
  const pct = Math.round(value * 100)
  const tone = value >= 0.85 ? 'emerald' : value >= 0.7 ? 'amber' : 'rose'
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={tone}>AI {pct}%</Badge>
      {threshold !== undefined && (
        <span className="text-[11px] text-ink-faint">
          {value >= threshold ? 'above' : 'below'} your {Math.round(threshold * 100)}% auto-apply threshold
        </span>
      )}
    </span>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled = false,
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  className?: string
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit' | 'reset'
}) {
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent-hover disabled:opacity-50 shadow-sm',
    secondary: 'border border-line bg-surface text-ink-muted hover:bg-highlight hover:text-highlight-fg disabled:opacity-50',
    ghost: 'text-ink-faint hover:bg-highlight hover:text-highlight-fg disabled:opacity-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50',
  }
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Stat({ label, value, sub, tone = 'text-ink' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-muted">{sub}</div>}
    </Card>
  )
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function FormPanel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {title ? <h3 className="text-sm font-semibold text-ink">{title}</h3> : null}
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-[72px] resize-y ${props.className ?? ''}`} />
}

export function SubTabs<T extends string>({
  tabs,
  active,
  onChange,
  action,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-line pb-px">
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-t-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active === tab.id
                ? 'border border-b-surface border-line bg-surface text-ink -mb-px'
                : 'text-ink-muted hover:bg-highlight hover:text-highlight-fg'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {action}
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[10vh]" onClick={onClose}>
      <div
        className={`w-full rounded-xl border border-line bg-surface p-4 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="modal-title" className="text-sm font-semibold text-ink">{title}</h2>
          <Button variant="ghost" onClick={onClose} title="Close">×</Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`max-w-xs ${className}`}
    />
  )
}

export function ListToolbar({
  search,
  onSearchChange,
  placeholder,
  filters,
  count,
}: {
  search: string
  onSearchChange: (v: string) => void
  placeholder?: string
  filters?: ReactNode
  count?: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput value={search} onChange={onSearchChange} placeholder={placeholder} />
      {filters}
      {count !== undefined && (
        <span className="ml-auto text-xs text-ink-faint">{count} shown</span>
      )}
    </div>
  )
}

/** Compact row list item */
export function ListRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line-subtle px-2.5 py-2 text-sm ${className}`}>{children}</div>
  )
}
