import { useMemo, useState } from 'react'
import { useStore } from '../store'
import {
  BUILT_IN_PRESETS,
  defaultConfig,
  deleteReportPreset,
  enrichFilters,
  formatCell,
  loadSavedReports,
  REPORT_SOURCES,
  runReport,
  saveReportPreset,
  sourceDef,
  type ChartType,
  type ReportConfig,
  type ReportSource,
  type SavedReport,
} from '../lib/reports'
import { BarChart, DonutChart, LineChart } from './charts'
import { Badge, Button, Card, Field, Input, SectionTitle, Select, Stat } from './ui'

function ChartPreview({ type, data }: { type: ChartType; data: { label: string; value: number }[] }) {
  if (type === 'line') return <LineChart data={data} />
  if (type === 'donut') return <DonutChart data={data} />
  return <BarChart data={data} />
}

export function Reports() {
  const { state, mode } = useStore()
  const [config, setConfig] = useState<ReportConfig>(() => defaultConfig('bills'))
  const [saved, setSaved] = useState<SavedReport[]>(() => loadSavedReports())
  const [presetName, setPresetName] = useState('')
  const [tableSearch, setTableSearch] = useState('')

  const def = useMemo(() => enrichFilters(state, sourceDef(config.source)), [state, config.source])
  const result = useMemo(() => runReport(state, config), [state, config])

  const visibleFieldDefs = def.fields.filter((f) => config.visibleFields.includes(f.id))
  const groupableFields = def.fields.filter((f) => f.chartGroupable)
  const measurableFields = [
    { id: 'count', label: 'Count of rows' },
    ...def.fields.filter((f) => f.chartMeasurable).map((f) => ({ id: f.id, label: `Sum of ${f.label}` })),
  ]

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase()
    if (!q) return result.rows
    return result.rows.filter((row) =>
      visibleFieldDefs.some((f) => String(row.values[f.id] ?? '').toLowerCase().includes(q)),
    )
  }, [result.rows, tableSearch, visibleFieldDefs])

  function setSource(source: ReportSource) {
    setConfig(defaultConfig(source))
    setTableSearch('')
  }

  function setFilter(id: string, value: string) {
    setConfig((c) => ({ ...c, filters: { ...c.filters, [id]: value } }))
  }

  function toggleField(fieldId: string) {
    setConfig((c) => ({
      ...c,
      visibleFields: c.visibleFields.includes(fieldId)
        ? c.visibleFields.filter((x) => x !== fieldId)
        : [...c.visibleFields, fieldId],
    }))
  }

  function loadPreset(cfg: ReportConfig) {
    setConfig(cfg)
    setTableSearch('')
  }

  function handleSavePreset() {
    if (!presetName.trim()) return
    setSaved(saveReportPreset(presetName.trim(), config))
    setPresetName('')
  }

  return (
    <div className="space-y-4">
      <SectionTitle sub="Build custom reports — pick a data source, filters, columns, and an optional chart.">
        Reports
      </SectionTitle>

      {mode === 'demo' && (
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Demo mode — Marketing/Inbox metrics are not included. Inventory + Finance data reflects your current session.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Config panel */}
        <div className="space-y-3">
          <Card className="p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Data source</h3>
            <Select value={config.source} onChange={(e) => setSource(e.target.value as ReportSource)}>
              {REPORT_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Card>

          <Card className="p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Filters</h3>
            <div className="space-y-2">
              {def.filters.map((f) => (
                <Field key={f.id} label={f.label}>
                  {f.type === 'select' ? (
                    <Select value={config.filters[f.id] ?? ''} onChange={(e) => setFilter(f.id, e.target.value)}>
                      {(f.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  ) : f.type === 'date' ? (
                    <Input type="date" value={config.filters[f.id] ?? ''} onChange={(e) => setFilter(f.id, e.target.value)} />
                  ) : (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={config.filters[f.id] === 'true'}
                        onChange={(e) => setFilter(f.id, e.target.checked ? 'true' : '')}
                      />
                      {f.label}
                    </label>
                  )}
                </Field>
              ))}
            </div>
          </Card>

          <Card className="p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Columns</h3>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {def.fields.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={config.visibleFields.includes(f.id)}
                    onChange={() => toggleField(f.id)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </Card>

          <Card className="p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Chart</h3>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.chart.enabled}
                onChange={(e) => setConfig((c) => ({ ...c, chart: { ...c.chart, enabled: e.target.checked } }))}
              />
              Show chart
            </label>
            {config.chart.enabled && (
              <div className="space-y-2">
                <Field label="Type">
                  <Select
                    value={config.chart.type}
                    onChange={(e) => setConfig((c) => ({ ...c, chart: { ...c.chart, type: e.target.value as ChartType } }))}
                  >
                    <option value="bar">Bar</option>
                    <option value="line">Line</option>
                    <option value="donut">Donut</option>
                  </Select>
                </Field>
                <Field label="Group by">
                  <Select
                    value={config.chart.groupBy}
                    onChange={(e) => setConfig((c) => ({ ...c, chart: { ...c.chart, groupBy: e.target.value } }))}
                  >
                    {groupableFields.map((f) => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Measure">
                  <Select
                    value={config.chart.measure}
                    onChange={(e) => setConfig((c) => ({ ...c, chart: { ...c.chart, measure: e.target.value } }))}
                  >
                    {measurableFields.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </Card>

          <Card className="p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Presets</h3>
            <div className="mb-2 flex flex-wrap gap-1">
              {BUILT_IN_PRESETS.map((p) => (
                <Button key={p.name} variant="ghost" onClick={() => loadPreset(p.config)}>{p.name}</Button>
              ))}
            </div>
            {saved.length > 0 && (
              <div className="mb-2 space-y-1">
                {saved.map((s) => (
                  <div key={s.id} className="flex items-center gap-1">
                    <Button variant="secondary" className="flex-1 justify-start" onClick={() => loadPreset(s.config)}>
                      {s.name}
                    </Button>
                    <Button variant="ghost" onClick={() => setSaved(deleteReportPreset(s.id))} title="Delete">×</Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Save as…"
                className="flex-1"
              />
              <Button variant="secondary" onClick={handleSavePreset} disabled={!presetName.trim()}>Save</Button>
            </div>
          </Card>
        </div>

        {/* Results panel */}
        <div className="space-y-3 min-w-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {result.totals.map((t) => (
              <Stat key={t.label} label={t.label} value={t.value} />
            ))}
          </div>

          {config.chart.enabled && result.chartData.length > 0 && (
            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-700">Chart</h3>
                <Badge tone="slate">{config.chart.type}</Badge>
              </div>
              <ChartPreview type={config.chart.type} data={result.chartData} />
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Input
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search results…"
                className="max-w-xs"
              />
              <span className="ml-auto text-xs text-slate-400">{filteredRows.length} rows</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    {visibleFieldDefs.map((f) => (
                      <th key={f.id} className="px-3 py-2 font-medium whitespace-nowrap">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleFieldDefs.length} className="px-3 py-6 text-center text-slate-400">
                        No rows match your filters.
                      </td>
                    </tr>
                  ) : filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      {visibleFieldDefs.map((f) => (
                        <td key={f.id} className="px-3 py-1.5 whitespace-nowrap text-slate-700">
                          {formatCell(row.values[f.id] ?? '—', f.kind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
