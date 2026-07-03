import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CHANNELS, getFunctionBaseWarning, getFunctionUrl, invokeOmniFunction } from '@/api/omnichannel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toastError, toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  Bot,
  CheckCircle2,
  Copy,
  KeyRound,
  Mail,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
} from 'lucide-react';

const CHANNEL_ICONS = {
  email: Mail,
  facebook: MessageCircle,
  instagram: Sparkles,
  whatsapp: Smartphone,
};

const STATUS_LABELS = {
  not_configured: 'Not configured',
  needs_secrets: 'Needs secrets',
  testing: 'Testing',
  connected: 'Connected',
  degraded: 'Degraded',
  error: 'Error',
};

function effectiveStatus(account = {}) {
  if (account.setup_status === 'connected' && account.send_enabled && account.receive_enabled) return 'connected';
  if (account.receive_enabled && !account.send_enabled) return 'receive_only';
  if (account.send_enabled && !account.receive_enabled) return 'send_only';
  return account.setup_status || 'not_configured';
}

function statusLabel(status) {
  if (status === 'receive_only') return 'Receive only';
  if (status === 'send_only') return 'Send ready';
  return STATUS_LABELS[status] || status;
}

function statusTone(status) {
  if (status === 'connected') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'receive_only') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'send_only') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'error' || status === 'needs_secrets') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'testing' || status === 'degraded') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function newestRunForChannel(runs, channelType) {
  return runs.find((run) => run.channel_type === channelType);
}

function newestRunForType(runs, channelType, testType) {
  return runs.find((run) => run.channel_type === channelType && run.test_type === testType);
}

function formatDateTime(value) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function SignalRow({ label, state, detail }) {
  const tone = state === 'ok'
    ? 'bg-emerald-500'
    : state === 'warn'
      ? 'bg-amber-500'
      : state === 'info'
        ? 'bg-blue-500'
        : 'bg-slate-300';
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-0.5', tone)} />
        <span className="font-medium text-slate-700">{label}</span>
      </div>
      <span className="text-muted-foreground text-right line-clamp-2">{detail}</span>
    </div>
  );
}

export default function OmnichannelSetup({
  currentUser = null,
  accountsOverride = null,
  runsOverride = null,
  readOnly = false,
  functionBaseOverride = undefined,
}) {
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const isAdmin = currentUser?.role === 'admin';
  const functionBaseWarning = getFunctionBaseWarning(functionBaseOverride);
  const useRemoteAccounts = !Array.isArray(accountsOverride);
  const useRemoteRuns = !Array.isArray(runsOverride);

  const { data: fetchedAccounts = [] } = useQuery({
    queryKey: ['channel_accounts'],
    queryFn: () => base44.entities.ChannelAccount.list('-updated_date', 100),
    enabled: useRemoteAccounts,
    refetchInterval: 15000,
  });

  const { data: fetchedRuns = [] } = useQuery({
    queryKey: ['connector_test_runs'],
    queryFn: () => base44.entities.ConnectorTestRun.list('-created_date', 100),
    enabled: useRemoteRuns,
    refetchInterval: 15000,
  });

  const accounts = useRemoteAccounts ? fetchedAccounts : accountsOverride;
  const runs = useRemoteRuns ? fetchedRuns : runsOverride;

  const accountByType = useMemo(() => {
    const map = {};
    for (const account of accounts) map[account.channel_type] = account;
    return map;
  }, [accounts]);

  const connectedCount = CHANNELS.filter((channel) => effectiveStatus(accountByType[channel.type]) === 'connected').length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['channel_accounts'] });
    queryClient.invalidateQueries({ queryKey: ['connector_test_runs'] });
  };

  const copyWebhook = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toastSuccess('Webhook URL copied');
    } catch {
      toastError(`Copy failed. URL: ${url}`);
    }
  };

  const runTest = async (channel) => {
    if (readOnly) {
      toastError('Local smoke view does not run live connector tests.');
      return;
    }
    setTesting(channel.type);
    try {
      const result = await invokeOmniFunction(channel.testFunction, {
        channel_type: channel.type,
        test_to: channel.type === 'email' ? testEmail.trim() : undefined,
        webhook_url: getFunctionUrl(channel.webhookFunction, channel.webhookQuery, functionBaseOverride),
      });
      if (result?.success) toastSuccess(`${channel.label} test passed`);
      else toastError(result?.error || result?.message || `${channel.label} test failed`);
      refresh();
    } catch (error) {
      toastError(error.message || `${channel.label} test failed`);
    } finally {
      setTesting('');
    }
  };

  const seedDemo = async () => {
    if (readOnly) {
      toastError('Local smoke view does not seed demo data.');
      return;
    }
    setTesting('seed');
    try {
      const result = await invokeOmniFunction('seedOmbDemoData', {});
      if (result?.success) {
        toastSuccess(`Seeded ${result.created || 0} OMB demo conversations`);
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
      } else {
        toastError(result?.error || 'Demo seed failed');
      }
    } catch (error) {
      toastError(error.message || 'Demo seed failed');
    } finally {
      setTesting('');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#F4F5F7]">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 md:py-7 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-5 h-5" style={{ color: '#C49A1A' }} />
              <h1 className="text-[20px] md:text-[24px] font-semibold text-foreground">Omnichannel Setup</h1>
            </div>
            <p className="text-[13px] text-muted-foreground max-w-2xl">
              Live connector setup for Module 1. Secrets stay in Base44; this page tests provider reachability, webhook health, and the ticket cockpit wiring.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="h-8 px-3 bg-white">
              {connectedCount}/4 connected
            </Badge>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={seedDemo} disabled={readOnly || testing === 'seed'} className="h-8">
                {testing === 'seed' ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                Seed OMB demo
              </Button>
            )}
          </div>
        </div>

        {!isAdmin && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Staff can view connector health. Only admins should configure Secrets or run live connector tests.</span>
          </div>
        )}

        {readOnly && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-[13px] text-blue-800 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Local smoke view. Connector actions are disabled; use the published Base44 app for live tests.</span>
          </div>
        )}

        {functionBaseWarning && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{functionBaseWarning} Set `VITE_BASE44_APP_BASE_URL` to the published function base or open the published app before configuring provider callbacks.</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {CHANNELS.map((channel) => {
            const account = accountByType[channel.type] || {};
            const latestRun = newestRunForChannel(runs, channel.type);
            const latestSecretRun = newestRunForType(runs, channel.type, 'secrets');
            const latestOutboundRun = newestRunForType(runs, channel.type, 'outbound');
            const webhookUrl = getFunctionUrl(channel.webhookFunction, channel.webhookQuery, functionBaseOverride);
            const Icon = CHANNEL_ICONS[channel.type] || MessageCircle;
            const status = effectiveStatus(account);
            const isTesting = testing === channel.type;
            const emailNeedsRecipient = channel.type === 'email' && !testEmail.trim();
            const inboundReady = !!account.receive_enabled;
            const outboundReady = !!account.send_enabled;
            const webhookState = account.webhook_status === 'healthy' ? 'ok' : account.webhook_status === 'failing' ? 'warn' : 'idle';
            return (
              <Card key={channel.type} className="rounded-lg shadow-sm border-slate-200 overflow-hidden">
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-100 flex-shrink-0">
                        <Icon className="w-5 h-5 text-slate-700" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-[16px]">{channel.label}</CardTitle>
                        <CardDescription className="text-[12px] mt-1">{channel.subtitle}</CardDescription>
                      </div>
                    </div>
                    <span className={cn('text-[11px] font-semibold border rounded-full px-2 py-1 whitespace-nowrap', statusTone(status))}>
                      {statusLabel(status)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <KeyRound className="w-3.5 h-3.5" />
                      Required Secrets
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {channel.requiredSecrets.map((secret) => (
                        <span key={secret} className="text-[11px] font-mono rounded bg-slate-100 border border-slate-200 px-2 py-1">
                          {secret}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Webhook URL</div>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={webhookUrl || 'Publish app / set Base44 function base to generate callback URL'} className="h-8 text-[11px] font-mono bg-white" />
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => copyWebhook(webhookUrl)} disabled={!webhookUrl}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {channel.type === 'email' && (
                      <p className="text-[11px] text-muted-foreground">Append the Postmark inbound secret as a query param: <span className="font-mono">?secret=...</span></p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Setup checklist</div>
                    <div className="space-y-1">
                      {channel.setupNotes.map((note) => (
                        <div key={note} className="flex gap-2 text-[12px] text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 flex-shrink-0" />
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {channel.type === 'email' && (
                    <div className="space-y-1">
                      <Input
                        placeholder="Required test recipient email"
                        value={testEmail}
                        onChange={(event) => setTestEmail(event.target.value)}
                        className="h-8 text-[12px] bg-white"
                      />
                      <p className="text-[11px] text-muted-foreground">Postmark must send a test email before Email becomes send-ready.</p>
                    </div>
                  )}

                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                    <SignalRow
                      label="Webhook"
                      state={webhookState}
                      detail={account.webhook_status || 'unknown'}
                    />
                    <SignalRow
                      label="Inbound"
                      state={inboundReady ? 'ok' : 'idle'}
                      detail={account.last_inbound_at ? `Last ${formatDateTime(account.last_inbound_at)}` : 'No inbound received'}
                    />
                    <SignalRow
                      label="Outbound"
                      state={outboundReady ? 'ok' : latestOutboundRun?.status === 'failed' ? 'warn' : 'idle'}
                      detail={account.last_outbound_at ? `Last ${formatDateTime(account.last_outbound_at)}` : latestOutboundRun?.message || 'No send confirmed'}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Latest test</span>
                      <span className={latestRun?.status === 'success' ? 'text-emerald-700 font-medium' : latestRun ? 'text-red-700 font-medium' : 'text-muted-foreground'}>
                        {latestRun?.status || 'none'}
                      </span>
                    </div>
                    <p className="text-[12px] text-foreground line-clamp-2">{latestRun?.message || latestSecretRun?.message || account.last_error || 'Run a test after adding Secrets in Base44.'}</p>
                    {status === 'receive_only' && <p className="text-[12px] text-blue-700">Inbound has worked, but outbound send is not enabled until connector test passes.</p>}
                    {status === 'send_only' && <p className="text-[12px] text-amber-700">Credentials are valid for sending. Waiting for a real inbound webhook before marking connected.</p>}
                  </div>

                  <Button
                    className="w-full h-9 text-[13px]"
                    variant={status === 'connected' ? 'outline' : 'default'}
                    onClick={() => runTest(channel)}
                    disabled={!isAdmin || readOnly || isTesting || emailNeedsRecipient || !webhookUrl}
                  >
                    {isTesting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    {status === 'connected' ? 'Re-test connector' : 'Test connector'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
