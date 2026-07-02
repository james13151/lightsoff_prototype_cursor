import { useState } from 'react'
import { useStore } from '../store'
import { classifyCapture, captureExamples } from '../ai/classify'
import type { CaptureDraft } from '../types'
import { Badge, Button, ConfidenceBadge } from './ui'

export function CaptureBar() {
  const { state, dispatch } = useStore()
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<CaptureDraft | null>(null)
  const [thinking, setThinking] = useState(false)

  const submit = (value: string) => {
    if (!value.trim()) return
    setThinking(true)
    setDraft(null)
    // Simulated latency so the "AI is classifying" moment is visible in the demo
    setTimeout(() => {
      setDraft(classifyCapture(value.trim(), state))
      setThinking(false)
    }, 550)
  }

  const confirm = () => {
    if (!draft) return
    dispatch({ type: 'APPLY_CAPTURE', draft })
    setDraft(null)
    setText('')
  }

  const reject = () => {
    setDraft(null)
  }

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-5xl px-8 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(text)
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">✦</span>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='Drop anything here — "Received 50 blue hoodies from Acme", a receipt, a customer DM…'
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
          <Button className="py-2.5">{thinking ? 'Classifying…' : 'Capture'}</Button>
        </form>

        {!draft && !thinking && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Try:</span>
            {captureExamples.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setText(ex)
                  submit(ex)
                }}
                className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-500 transition hover:border-slate-300 hover:text-slate-700 cursor-pointer"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {thinking && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
            AI is classifying intent and extracting structure…
          </div>
        )}

        {draft && (
          <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="indigo">{draft.intentLabel}</Badge>
              <Badge tone="slate">→ {draft.module}</Badge>
              <ConfidenceBadge value={draft.confidence} threshold={state.settings.confidenceThreshold} />
              {draft.stakes === 'high' && <Badge tone="rose">high stakes — always pauses for approval</Badge>}
            </div>
            <p className="mt-2 text-sm text-slate-600">{draft.explanation}</p>
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {draft.fields.map((f) => (
                <div key={f.label} className="flex items-baseline gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
                  <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">{f.label}</span>
                  <span className="truncate text-slate-800" title={f.value}>{f.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button onClick={confirm}>Confirm & apply</Button>
              <Button variant="secondary" onClick={reject}>Discard</Button>
              <span className="text-[11px] text-slate-400">AI drafts, you approve — nothing is written until you confirm.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
