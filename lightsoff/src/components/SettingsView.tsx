import { useStore } from '../store'
import { Card, SectionTitle } from './ui'

export function SettingsView() {
  const { state, dispatch } = useStore()
  const pct = Math.round(state.settings.confidenceThreshold * 100)

  return (
    <div className="max-w-2xl space-y-6">
      <SectionTitle sub="Confidence-aware automation is a cross-cutting policy, not a per-module setting. This threshold is visible and adjustable — never hidden.">
        AI Settings
      </SectionTitle>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Auto-apply threshold</div>
            <p className="mt-0.5 text-sm text-slate-500">
              Low-stakes actions at or above this confidence auto-apply with an undo window. Everything below it — and
              every high-stakes action regardless of confidence — pauses for your explicit approval.
            </p>
          </div>
          <div className="ml-4 text-2xl font-semibold text-indigo-600">{pct}%</div>
        </div>
        <input
          type="range"
          min={50}
          max={99}
          value={pct}
          onChange={(e) => dispatch({ type: 'SET_THRESHOLD', value: Number(e.target.value) / 100 })}
          className="mt-4 w-full accent-indigo-600"
        />
        <div className="mt-1 flex justify-between text-[11px] text-slate-400">
          <span>50% — trust AI more, review less</span>
          <span>99% — review nearly everything</span>
        </div>
      </Card>

      <Card className="p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={state.settings.autoApplyEnabled}
            onChange={(e) => dispatch({ type: 'SET_AUTO_APPLY', value: e.target.checked })}
            className="mt-1 h-4 w-4 accent-indigo-600"
          />
          <span>
            <span className="text-sm font-semibold">Enable auto-apply</span>
            <p className="mt-0.5 text-sm text-slate-500">
              When off, every AI action pauses for approval regardless of confidence — useful for the first weeks while
              you calibrate trust. Try capturing "Paid $12 for coffee at Blue Bottle" with this on vs off to feel the difference.
            </p>
          </span>
        </label>
      </Card>

      <Card className="p-5">
        <div className="text-sm font-semibold">What always pauses for approval (high-stakes)</div>
        <ul className="mt-2 space-y-1 text-sm text-slate-500">
          <li>· Any spend change on ad campaigns (including resuming an OOS-paused campaign)</li>
          <li>· Bills or expenses above typical size, or from a new vendor</li>
          <li>· Replies to negative-sentiment or dispute-risk conversations</li>
          <li>· Any purchase order before it is sent to a vendor</li>
        </ul>
      </Card>
    </div>
  )
}
