import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { ChannelAccount, ChannelKind, ConnectorTestRun } from '../types'
import { Badge, Button, Card, Input, SectionTitle, timeAgo } from './ui'

const CHANNEL_ICON: Record<ChannelKind, string> = {
  email: '✉️',
  facebook: '👤',
  instagram: '📸',
  whatsapp: '🟢',
}

function statusFor(account: ChannelAccount) {
  if (account.sendEnabled && account.receiveEnabled) return 'Connected'
  if (account.sendEnabled) return 'Send ready'
  if (account.receiveEnabled) return 'Receive only'
  if (account.setupStatus === 'needs_secrets') return 'Needs secrets'
  if (account.setupStatus === 'error') return 'Error'
  return 'Not configured'
}

function toneFor(account: ChannelAccount) {
  if (account.sendEnabled && account.receiveEnabled) return 'emerald'
  if (account.sendEnabled) return 'amber'
  if (account.receiveEnabled) return 'sky'
  if (account.setupStatus === 'needs_secrets' || account.setupStatus === 'error') return 'rose'
  return 'slate'
}

function latestRun(runs: ConnectorTestRun[], channel: ChannelKind, testType?: ConnectorTestRun['testType']) {
  return runs.find((run) => run.channel === channel && (!testType || run.testType === testType))
}

function webhookUrl(base: string, account: ChannelAccount) {
  const cleanBase = base.replace(/\/$/, '')
  const query = account.webhookQuery ? `?${account.webhookQuery}` : ''
  return `${cleanBase}/functions/${account.webhookFunction}${query}`
}

export function OmnichannelSetup() {
  const { state, dispatch } = useStore()
  const [baseUrl, setBaseUrl] = useState('https://your-published-base44-function-base')

  const orderedAccounts = useMemo(
    () => [...state.channelAccounts].sort((a, b) => ['email', 'facebook', 'instagram', 'whatsapp'].indexOf(a.channel) - ['email', 'facebook', 'instagram', 'whatsapp'].indexOf(b.channel)),
    [state.channelAccounts],
  )

  const connected = orderedAccounts.filter((account) => account.sendEnabled && account.receiveEnabled).length

  return (
    <div>
      <SectionTitle sub="Live connector setup for Module 1. Secrets stay in provider dashboards/Base44; this screen tracks readiness, callback URLs, webhook health, and manual-send policy inside the native prototype.">
        Omnichannel Setup
      </SectionTitle>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink">Published function base</div>
          <p className="mt-1 text-sm text-ink-muted">
            Use the published HTTPS Base44 function base, not localhost and not the editor preview URL. If the base includes
            <span className="font-mono"> /api/apps/&lt;app-id&gt;</span>, keep that path.
          </p>
          <Input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className="mt-3 font-mono text-xs"
          />
        </Card>
        <Card className="flex items-center justify-between gap-4 p-4 md:block md:min-w-44">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Connected</div>
          <div className="mt-1 text-3xl font-semibold text-accent">{connected}/4</div>
          <div className="text-xs text-ink-muted">send + receive ready</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {orderedAccounts.map((account) => {
          const url = webhookUrl(baseUrl, account)
          const last = latestRun(state.connectorTestRuns, account.channel)
          const inbound = latestRun(state.connectorTestRuns, account.channel, 'inbound')
          const outbound = latestRun(state.connectorTestRuns, account.channel, 'outbound')

          return (
            <Card key={account.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{CHANNEL_ICON[account.channel]}</span>
                    <h3 className="text-sm font-semibold text-ink">{account.displayName}</h3>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {account.channel === 'email' && 'Postmark inbound webhook + outbound email send'}
                    {account.channel === 'facebook' && 'Meta Page Messenger'}
                    {account.channel === 'instagram' && 'Instagram professional messaging'}
                    {account.channel === 'whatsapp' && 'WhatsApp Cloud API'}
                  </p>
                </div>
                <Badge tone={toneFor(account)}>{statusFor(account)}</Badge>
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Required secrets</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {account.requiredSecrets.map((secret) => (
                    <span key={secret} className="rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink-muted">
                      {secret}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Webhook URL</div>
                <div className="mt-1 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[11px] text-ink-muted break-all">
                  {url}
                </div>
                {account.channel === 'email' && (
                  <p className="mt-1 text-[11px] text-ink-faint">Postmark appends the inbound shared secret as <span className="font-mono">?secret=...</span>.</p>
                )}
              </div>

              <div className="mt-4 grid gap-2 text-xs text-ink-muted sm:grid-cols-3">
                <div className="rounded-lg border border-line-subtle p-2">
                  <div className="font-semibold text-ink">Webhook</div>
                  <div>{account.webhookStatus}</div>
                </div>
                <div className="rounded-lg border border-line-subtle p-2">
                  <div className="font-semibold text-ink">Inbound</div>
                  <div>{account.lastInboundAt ? timeAgo(account.lastInboundAt) : inbound?.message ?? 'No proof yet'}</div>
                </div>
                <div className="rounded-lg border border-line-subtle p-2">
                  <div className="font-semibold text-ink">Outbound</div>
                  <div>{account.lastOutboundAt ? timeAgo(account.lastOutboundAt) : outbound?.message ?? 'No proof yet'}</div>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                {account.setupChecklist.map((item) => (
                  <div key={item} className="flex gap-2 text-xs text-ink-muted">
                    <span className="text-emerald-600">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-line-subtle bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">Latest diagnostic</span>
                  <Badge tone={last?.status === 'success' ? 'emerald' : last ? 'rose' : 'slate'}>{last?.status ?? 'none'}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">{last?.message ?? account.lastError ?? 'No connector test recorded yet.'}</p>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => dispatch({
                    type: 'RECORD_CONNECTOR_TEST',
                    channel: account.channel,
                    testType: 'outbound',
                    status: 'success',
                    message: 'Local operator recorded outbound provider proof.',
                  })}
                >
                  Record outbound proof
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => dispatch({
                    type: 'RECORD_CONNECTOR_TEST',
                    channel: account.channel,
                    testType: 'inbound',
                    status: 'success',
                    message: 'Local operator recorded inbound webhook proof.',
                  })}
                >
                  Record inbound proof
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
