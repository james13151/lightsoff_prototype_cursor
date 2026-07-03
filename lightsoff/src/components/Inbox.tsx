import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { ChannelAccount, ChannelKind, Conversation, SendPolicyState } from '../types'
import { Badge, Button, Card, ConfidenceBadge, SectionTitle, timeAgo } from './ui'

const CHANNEL_ICON: Record<ChannelKind, string> = {
  instagram: '📸', whatsapp: '🟢', email: '✉️', facebook: '👤',
}

const POLICY_TONE: Record<SendPolicyState, string> = {
  ready: 'emerald',
  needs_secrets: 'rose',
  receive_only: 'sky',
  outside_service_window: 'amber',
  blocked: 'rose',
}

const RISK_TONE = {
  low: 'emerald',
  medium: 'amber',
  high: 'rose',
}

function readablePolicy(policy?: SendPolicyState) {
  return (policy ?? 'blocked').replace(/_/g, ' ')
}

function sendReadiness(conversation: Conversation, account?: ChannelAccount) {
  if (!account) {
    return { canSend: false, reason: 'No channel account is configured for this conversation.' }
  }
  if (!account.sendEnabled || !account.receiveEnabled) {
    return {
      canSend: false,
      reason: `${account.displayName} needs live ${account.sendEnabled ? 'inbound webhook' : 'outbound send'} proof before replies can be sent.`,
    }
  }
  if (
    conversation.channel === 'whatsapp' &&
    conversation.serviceWindowUntil &&
    new Date(conversation.serviceWindowUntil).getTime() < Date.now()
  ) {
    return {
      canSend: false,
      reason: 'WhatsApp free-form replies are outside the 24-hour service window. Use a template path first.',
    }
  }
  if (conversation.sendPolicyState && conversation.sendPolicyState !== 'ready') {
    const reasonByPolicy: Record<Exclude<SendPolicyState, 'ready'>, string> = {
      needs_secrets: 'Connector secrets are missing or unverified.',
      receive_only: 'This channel is receive-only until outbound provider proof is recorded.',
      outside_service_window: 'The channel policy blocks a free-form reply right now.',
      blocked: 'The channel policy blocks sending this draft.',
    }
    return { canSend: false, reason: reasonByPolicy[conversation.sendPolicyState] }
  }
  return { canSend: true, reason: 'Manual approval will send through the live connector.' }
}

export function Inbox({ focusId }: { focusId?: string }) {
  const { state, dispatch } = useStore()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId])

  const ordered = [...state.conversations].sort((a, b) => {
    const rank = (c: typeof a) => (c.status === 'open' ? (c.urgent ? 0 : 1) : 2)
    return rank(a) - rank(b)
  })

  return (
    <div>
      <SectionTitle sub="One queue across Instagram, WhatsApp, Facebook, and email. AI triages by sentiment/urgency and drafts replies grounded in live order and stock data.">
        Unified Inbox
      </SectionTitle>
      <div className="space-y-3">
        {ordered.map((c) => {
          const account = state.channelAccounts.find((item) => item.id === c.channelAccountId) ?? state.channelAccounts.find((item) => item.channel === c.channel)
          const draft = c.aiDraftId ? state.aiDrafts.find((item) => item.id === c.aiDraftId) : state.aiDrafts.find((item) => item.conversationId === c.id && item.approvalState === 'draft')
          const draftBody = draft?.body ?? c.aiDraft ?? ''
          const draftText = edits[c.id] ?? draftBody
          const hasDraft = c.status === 'open' && draftBody.length > 0 && draft?.approvalState !== 'discarded'
          const readiness = sendReadiness(c, account)
          const isFocus = c.id === focusId
          return (
            <div key={c.id} ref={isFocus ? focusRef : undefined}>
              <Card className={`p-4 ${isFocus ? 'ring-2 ring-indigo-300' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base">{CHANNEL_ICON[c.channel]}</span>
                  <span className="text-sm font-semibold">{c.customerName}</span>
                  <span className="text-sm text-slate-500">— {c.subject}</span>
                  <Badge tone={account?.sendEnabled && account.receiveEnabled ? 'emerald' : 'amber'}>
                    {account?.displayName ?? c.channel}
                  </Badge>
                  {c.sendPolicyState && (
                    <Badge tone={POLICY_TONE[c.sendPolicyState]}>{readablePolicy(c.sendPolicyState)}</Badge>
                  )}
                  {c.urgent && <Badge tone="rose">urgent · negative sentiment</Badge>}
                  <Badge tone={c.status === 'open' ? 'amber' : 'emerald'}>{c.status}</Badge>
                  <span className="ml-auto text-xs text-slate-400">{timeAgo(c.messages[c.messages.length - 1].at)}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
                  {c.externalThreadId && <span>Thread: <span className="font-mono">{c.externalThreadId}</span></span>}
                  {c.externalCustomerId && <span>Customer: <span className="font-mono">{c.externalCustomerId}</span></span>}
                  {c.lastExternalMessageAt && <span>Last inbound: {timeAgo(c.lastExternalMessageAt)}</span>}
                  {c.serviceWindowUntil && <span>WhatsApp window: {timeAgo(c.serviceWindowUntil)}</span>}
                </div>

                {c.aiSummary && (
                  <div className="mt-3 rounded-lg border border-line-subtle bg-surface-2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="indigo">AI summary</Badge>
                      {c.aiIntent && <Badge tone="slate">{c.aiIntent.replace(/_/g, ' ')}</Badge>}
                      {c.aiRisk && <Badge tone={RISK_TONE[c.aiRisk]}>{c.aiRisk} risk</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">{c.aiSummary}</p>
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {c.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm ${
                        m.from === 'customer' ? 'bg-slate-100 text-slate-800' : 'ml-auto bg-slate-900 text-white'
                      }`}
                    >
                      <div className={`mb-1 text-[10px] uppercase tracking-wide ${m.from === 'customer' ? 'text-slate-500' : 'text-white/60'}`}>
                        {m.from === 'customer' ? 'External message' : 'Brand reply'} · {timeAgo(m.at)}
                      </div>
                      {m.body}
                    </div>
                  ))}
                </div>

                {hasDraft && (
                  <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="indigo">✦ AI draft · approval required</Badge>
                      <ConfidenceBadge value={draft?.confidence ?? c.aiDraftConfidence} threshold={state.settings.confidenceThreshold} />
                    </div>
                    {c.aiContext.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {c.aiContext.map((ctx, i) => (
                          <div key={i} className="text-[11px] text-slate-500">◦ {ctx}</div>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={draftText}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      rows={3}
                      className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        disabled={!readiness.canSend || draftText.trim().length === 0}
                        title={readiness.reason}
                        onClick={() => {
                          if (!readiness.canSend || draftText.trim().length === 0) return
                          dispatch({ type: 'APPROVE_REPLY', convId: c.id, body: draftText })
                        }}
                      >
                        {edits[c.id] && edits[c.id] !== draftBody ? 'Send edited reply' : 'Approve & send'}
                      </Button>
                      {draft && (
                        <Button variant="secondary" onClick={() => dispatch({ type: 'DISCARD_AI_DRAFT', draftId: draft.id })}>
                          Discard draft
                        </Button>
                      )}
                      <span className="text-[11px] text-slate-400">
                        {readiness.canSend
                          ? (c.urgent ? 'High-stakes conversation — human approval required before send.' : 'AI is draft-only in beta; no autonomous sending.')
                          : readiness.reason}
                      </span>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}
