const COLORS = ['#0f172a', '#334155', '#0369a1', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777']

export function BarChart({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No data for chart</p>
  }
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t transition-all"
            style={{
              height: `${Math.max(4, (d.value / max) * (height - 36))}px`,
              backgroundColor: COLORS[i % COLORS.length],
            }}
            title={`${d.label}: ${d.value.toLocaleString()}`}
          />
          <span className="max-w-full truncate text-[9px] text-slate-500" title={d.label}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function LineChart({ data, height = 160 }: { data: { label: string; value: number }[]; height?: number }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No data for chart</p>
  }
  const max = Math.max(...data.map((d) => d.value), 1)
  const w = 100
  const h = height - 24
  const points = data.map((d, i) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w
    const y = h - (d.value / max) * (h - 8)
    return `${x},${y}`
  }).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
        <polyline fill="none" stroke="#0f172a" strokeWidth="1.5" points={points} />
        {data.map((d, i) => {
          const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w
          const y = h - (d.value / max) * (h - 8)
          return <circle key={d.label} cx={x} cy={y} r="2" fill="#0369a1" />
        })}
      </svg>
      <div className="mt-1 flex justify-between gap-1 text-[9px] text-slate-500">
        {data.map((d) => (
          <span key={d.label} className="truncate" title={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  )
}

export function DonutChart({ data, size = 140 }: { data: { label: string; value: number }[]; size?: number }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No data for chart</p>
  }
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let cumulative = 0
  const r = 40
  const cx = 50
  const cy = 50
  const slices = data.map((d, i) => {
    const start = cumulative / total
    cumulative += d.value
    const end = cumulative / total
    const large = end - start > 0.5 ? 1 : 0
    const a1 = (start * 2 * Math.PI) - Math.PI / 2
    const a2 = (end * 2 * Math.PI) - Math.PI / 2
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy + r * Math.sin(a2)
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
    return { path, color: COLORS[i % COLORS.length], label: d.label, pct: ((d.value / total) * 100).toFixed(0) }
  })
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
        {slices.map((s) => (
          <path key={s.label} d={s.path} fill={s.color} opacity={0.9}>
            <title>{`${s.label}: ${s.pct}%`}</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={22} fill="white" />
      </svg>
      <div className="flex-1 space-y-1 text-xs">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="flex-1 truncate text-slate-600">{s.label}</span>
            <span className="text-slate-400">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
