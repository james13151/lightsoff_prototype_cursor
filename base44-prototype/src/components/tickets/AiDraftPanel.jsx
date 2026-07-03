import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { invokeOmniFunction, sendDraftReply } from '@/api/omnichannel';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toastError, toastSuccess } from '@/lib/toast';
import { Bot, RefreshCw, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const RISK_TONE = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-red-50 text-red-700 border-red-200',
  blocked: 'bg-slate-100 text-slate-700 border-slate-200',
};

function whatsappWindowOpen(ticket) {
  if (ticket?.channel_type !== 'whatsapp' || !ticket?.last_external_message_at) return false;
  const lastInbound = new Date(ticket.last_external_message_at).getTime();
  return Number.isFinite(lastInbound) && Date.now() - lastInbound < 24 * 60 * 60 * 1000;
}

export default function AiDraftPanel({ ticket, currentUser = null }) {
  const queryClient = useQueryClient();
  const [draftText, setDraftText] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [languageCode, setLanguageCode] = useState('en_US');
  const [busy, setBusy] = useState('');

  const { data: drafts = [] } = useQuery({
    queryKey: ['ai_drafts', ticket?.id],
    queryFn: () => base44.entities.AiDraft.filter({ ticket_id: String(ticket.id) }, '-created_date', 10),
    enabled: !!ticket?.id,
    refetchInterval: 15000,
  });

  const { data: channelAccounts = [] } = useQuery({
    queryKey: ['channel_account', ticket?.channel_type],
    queryFn: () => base44.entities.ChannelAccount.filter({ channel_type: ticket.channel_type }, '-updated_date', 1),
    enabled: !!ticket?.channel_type,
    refetchInterval: 15000,
  });

  const activeDraft = useMemo(() => drafts.find((draft) => !['sent', 'discarded'].includes(draft.approval_state)) || drafts[0], [drafts]);
  const channelAccount = channelAccounts[0];
  const connectorReady = !ticket?.channel_type || (
    channelAccount?.setup_status === 'connected' &&
    channelAccount?.send_enabled &&
    channelAccount?.receive_enabled
  );
  const isWhatsApp = ticket?.channel_type === 'whatsapp';
  const whatsappOpen = whatsappWindowOpen(ticket);
  const needsWhatsAppTemplate = isWhatsApp && !whatsappOpen;

  React.useEffect(() => {
    setDraftText(activeDraft?.edited_text || activeDraft?.draft_text || '');
  }, [activeDraft?.id]);

  if (!ticket?.channel_type && !activeDraft) return null;

  const refreshDraft = async () => {
    setBusy('draft');
    try {
      const result = await invokeOmniFunction('createAiDraftForTicket', { ticket_id: ticket.id });
      if (result?.success) {
        toastSuccess('AI draft prepared');
        queryClient.invalidateQueries({ queryKey: ['ai_drafts', ticket.id] });
        queryClient.invalidateQueries({ queryKey: ['timeline', ticket.id] });
        queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });
      } else {
        toastError(result?.error || 'Draft generation failed');
      }
    } catch (error) {
      toastError(error.message || 'Draft generation failed');
    } finally {
      setBusy('');
    }
  };

  const discardDraft = async () => {
    if (!activeDraft?.id) return;
    setBusy('discard');
    await base44.entities.AiDraft.update(activeDraft.id, { approval_state: 'discarded' });
    queryClient.invalidateQueries({ queryKey: ['ai_drafts', ticket.id] });
    toastSuccess('Draft discarded');
    setBusy('');
  };

  const approveAndSend = async () => {
    if (!activeDraft?.id || !draftText.trim()) {
      toastError('Draft text is required');
      return;
    }
    if (!connectorReady) {
      toastError('Connector is not ready. Run the channel test in Omnichannel Setup before sending.');
      return;
    }
    if (needsWhatsAppTemplate && !templateName.trim()) {
      toastError('WhatsApp service window is closed. Add an approved template name before sending.');
      return;
    }
    setBusy('send');
    try {
      await base44.entities.AiDraft.update(activeDraft.id, {
        approval_state: 'approved',
        edited_text: draftText.trim(),
        approved_by_id: currentUser?.id,
        approved_by_name: currentUser?.full_name,
        approved_at: new Date().toISOString(),
      });
      const result = await sendDraftReply({
        channelType: ticket.channel_type || activeDraft.channel_type,
        ticketId: ticket.id,
        aiDraftId: activeDraft.id,
        bodyText: draftText.trim(),
        templateName: ticket.channel_type === 'whatsapp' ? templateName.trim() : '',
        languageCode,
      });
      if (result?.success) {
        toastSuccess('Reply sent');
        queryClient.invalidateQueries({ queryKey: ['ai_drafts', ticket.id] });
        queryClient.invalidateQueries({ queryKey: ['timeline', ticket.id] });
        queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });
      } else {
        if (result?.blocked) {
          await base44.entities.AiDraft.update(activeDraft.id, {
            approval_state: 'blocked',
            send_policy_state: 'blocked_whatsapp_template_required',
          });
          queryClient.invalidateQueries({ queryKey: ['ai_drafts', ticket.id] });
          queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });
        }
        toastError(result?.error || 'Send failed');
      }
    } catch (error) {
      toastError(error.message || 'Send failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mx-4 md:mx-6 mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4" style={{ color: '#C49A1A' }} />
            <h3 className="text-[14px] font-semibold text-foreground">AI draft</h3>
            {activeDraft?.risk_level && (
              <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5', RISK_TONE[activeDraft.risk_level])}>
                {activeDraft.risk_level}
              </Badge>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground line-clamp-2">
            {activeDraft?.summary || ticket.ai_summary || 'Generate a draft from the latest channel message.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshDraft} disabled={busy === 'draft'} className="h-8 px-2">
          {busy === 'draft' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </Button>
      </div>

      {activeDraft?.recommended_action && (
        <div className="rounded-md bg-white border border-slate-200 px-3 py-2 text-[12px] text-muted-foreground">
          {activeDraft.recommended_action}
        </div>
      )}

      {!connectorReady && ticket?.channel_type && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          Connector is not send-ready. Run the {ticket.channel_type} connector test in Omnichannel Setup after adding Secrets.
          {channelAccount?.last_error ? ` Last error: ${channelAccount.last_error}` : ''}
        </div>
      )}

      <Textarea
        value={draftText}
        onChange={(event) => setDraftText(event.target.value)}
        placeholder="Generate or write a reply draft..."
        rows={4}
        className="bg-white text-[13px]"
      />

      {isWhatsApp && (
        <div className={cn(
          'rounded-md border px-3 py-2 space-y-2',
          whatsappOpen ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        )}>
          <p className={cn('text-[12px]', whatsappOpen ? 'text-emerald-800' : 'text-amber-800')}>
            {whatsappOpen
              ? 'WhatsApp service window is open. Free-form reply is allowed.'
              : 'WhatsApp service window is closed. Use an approved template to send.'}
          </p>
          {!whatsappOpen && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Approved WhatsApp template name"
                className="h-8 rounded-md border border-input bg-white px-3 text-[12px]"
              />
              <input
                value={languageCode}
                onChange={(event) => setLanguageCode(event.target.value)}
                placeholder="Language code"
                className="h-8 rounded-md border border-input bg-white px-3 text-[12px]"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <p className="text-[11px] text-muted-foreground">Draft-only beta: every outbound message requires this manual approval.</p>
        <div className="flex items-center gap-2">
          {activeDraft?.id && (
            <Button variant="ghost" size="sm" onClick={discardDraft} disabled={busy === 'discard'} className="h-8 text-[12px]">
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Discard
            </Button>
          )}
          <Button size="sm" onClick={approveAndSend} disabled={!activeDraft?.id || busy === 'send' || !connectorReady} className="h-8 text-[12px]">
            {busy === 'send' ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Approve + Send
          </Button>
        </div>
      </div>
    </div>
  );
}
