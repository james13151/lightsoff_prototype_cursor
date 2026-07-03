import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatTicketId, relativeTime, isOverdue, isDueToday, getInitials } from '@/lib/helpers';
import { canReceiveTicketNotification } from '@/lib/permissions';
import { useSettings } from '@/lib/settingsContext';
import StatusPill from './StatusPill';
import TimelineSection from './TimelineSection';
import CommentInput from './CommentInput';
import StatusChangeBar from './StatusChangeBar';
import InlineTicketEdit from './InlineTicketEdit';
import TicketMemoPreview from './TicketMemoPreview';
import InternalNotes from './InternalNotes';
import AiDraftPanel from './AiDraftPanel';
import ChannelBadge from './ChannelBadge';
import { Pencil, Trash2, Eye, EyeOff, ShoppingCart, PackageMinus, Truck, MoreHorizontal, Archive } from 'lucide-react';
import TicketTypePill from './TicketTypePill';
import CreatePODialog from '@/components/purchasing/CreatePODialog';
import InitiateOutboundDialog from './InitiateOutboundDialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from '@/components/ui/sheet';
import moment from 'moment';
import { cn } from '@/lib/utils';
import { toastSuccess } from '@/lib/toast';

export default function TicketDetail({ ticketId, currentUser, users, onDelete, onRefresh = () => {}, onOpenMemos, onInitiatePO }) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const vf = settings.visible_fields;
  const isAdmin = currentUser?.role === 'admin';
  const isStaff = currentUser?.role === 'staff';
  const canInitiateOutbound = isAdmin || isStaff;
  const [isEditing, setIsEditing] = useState(false);
  const [showPODialog, setShowPODialog] = useState(false);
  const [showOutboundDialog, setShowOutboundDialog] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const { data: ticket } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: () => base44.entities.Ticket.filter({ id: ticketId }),
    select: data => data?.[0],
    enabled: !!ticketId,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['timeline', ticketId],
    queryFn: () => base44.entities.TimelineEntry.filter({ ticket_id: String(ticketId) }, 'created_date', 200),
    enabled: !!ticketId,
  });

  // Exit edit mode when ticket changes
  useEffect(() => { setIsEditing(false); }, [ticketId]);

  // Mark as read
  useEffect(() => {
    if (ticket && currentUser && !ticket.read_by?.includes(currentUser.id)) {
      const newReadBy = [...(ticket.read_by || []), currentUser.id];
      base44.entities.Ticket.update(ticket.id, { read_by: newReadBy }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      });
    }
  }, [ticket?.id, currentUser?.id]);

  const toggleRead = async () => {
    if (!ticket || !currentUser) return;
    const isRead = ticket.read_by?.includes(currentUser.id);
    const newReadBy = isRead
      ? (ticket.read_by || []).filter(id => id !== currentUser.id)
      : [...(ticket.read_by || []), currentUser.id];
    await base44.entities.Ticket.update(ticket.id, { read_by: newReadBy });
    toastSuccess(isRead ? '已标记为未读' : '已标记为已读');
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
  };

  const deleteEntry = async (entryId) => {
    await base44.entities.TimelineEntry.delete(entryId);
    toastSuccess('备注已删除');
    queryClient.invalidateQueries({ queryKey: ['timeline', ticketId] });
  };

  const addComment = async (content) => {
    await base44.entities.TimelineEntry.create({
      ticket_id: String(ticketId),
      author_id: currentUser.id,
      author_name: currentUser.full_name,
      content,
      entry_type: 'comment',
      is_system: false,
    });
    queryClient.invalidateQueries({ queryKey: ['timeline', ticketId] });

    // Parse @mentions
    const mentionRegex = /@(\S+)/g;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionedUser = users?.find(u => u.full_name === match[1]);
      if (mentionedUser && mentionedUser.id !== currentUser.id && canReceiveTicketNotification(mentionedUser)) {
        await base44.entities.Notification.create({
          user_id: mentionedUser.id,
          ticket_id: String(ticketId),
          message: `${currentUser.full_name} 在工单 ${formatTicketId(ticket.id)} 中提到了你`,
          is_read: false,
        });
        const newReadBy = (ticket.read_by || []).filter(id => id !== mentionedUser.id);
        await base44.entities.Ticket.update(ticket.id, { read_by: newReadBy });
      }
    }
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
  };

  const handleArchive = async () => {
    await base44.entities.Ticket.update(ticket.id, {
      is_archived: true,
      archived_reason: '已解决',
      pre_archive_status: ticket.status,
    });
    await base44.entities.TimelineEntry.create({
      ticket_id: String(ticket.id),
      author_id: currentUser.id,
      author_name: currentUser.full_name,
      content: '工单已手动归档',
      entry_type: 'system',
      is_system: true,
    });
    toastSuccess('工单已归档');
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['tickets_archived'] });
    queryClient.invalidateQueries({ queryKey: ['tickets_archived_count'] });
  };

  if (!ticket) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center">
          <p className="text-[14px] text-muted-foreground">选择一个工单开始处理</p>
          <p className="text-[12px] text-muted-foreground/50 mt-1">从左侧列表中选择工单</p>
        </div>
      </div>
    );
  }

  const isTicketRead = ticket.read_by?.includes(currentUser?.id);
  const dueDateOverdue = isOverdue(ticket.due_date);
  const dueDateToday = isDueToday(ticket.due_date);

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* Header */}
        <div className="px-4 md:px-6 pt-5 pb-4 border-b border-thin border-border">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono text-muted-foreground">{formatTicketId(ticket.id)}</span>
                <span className="text-[11px] text-muted-foreground/40">·</span>
                <span className="text-[11px] text-muted-foreground">{relativeTime(ticket.created_date)}</span>
                <ChannelBadge channel={ticket.channel_type} />
              </div>
              <h2 className="text-[17px] md:text-[18px] font-semibold text-foreground leading-snug line-clamp-2">{ticket.title}</h2>
              {ticket.ai_summary && (
                <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
                  <p className="text-[12px] text-muted-foreground">
                    <span className="font-semibold text-foreground">AI summary:</span> {ticket.ai_summary}
                  </p>
                  {(ticket.ai_intent || ticket.ai_risk || ticket.send_policy_state) && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {ticket.ai_intent && <span>Intent: {ticket.ai_intent}</span>}
                      {ticket.ai_risk && <span> · Risk: {ticket.ai_risk}</span>}
                      {ticket.send_policy_state && <span> · Policy: {ticket.send_policy_state}</span>}
                    </p>
                  )}
                </div>
              )}
            </div>
            {/* Desktop action buttons */}
            <div className="hidden md:flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="sm" onClick={toggleRead} className="h-7 text-[11px] px-2">
                {isTicketRead ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                {isTicketRead ? '标记未读' : '标记已读'}
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => setIsEditing(e => !e)}
                className={cn('h-7 text-[11px] px-2', isEditing && 'text-primary')}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                {isEditing ? '收起' : '编辑'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowPODialog(true)} className="h-7 text-[11px] px-2 text-primary hover:text-primary">
                <ShoppingCart className="w-3.5 h-3.5 mr-1" />发起采购
              </Button>
              {canInitiateOutbound && (
                <Button variant="ghost" size="sm" onClick={() => setShowOutboundDialog(true)} className="h-7 text-[11px] px-2 text-blue-400 hover:text-blue-400">
                  <PackageMinus className="w-3.5 h-3.5 mr-1" />发起出库
                </Button>
              )}
              {(ticket.status === '待发货') && canInitiateOutbound && (
                <Button
                  variant="ghost" size="sm"
                  onClick={async () => {
                    await base44.entities.Ticket.update(ticket.id, { status: '已发货' });
                    await base44.entities.TimelineEntry.create({
                      ticket_id: String(ticket.id),
                      author_id: currentUser.id,
                      author_name: currentUser.full_name,
                      content: '已录入Shopify，工单完成',
                      entry_type: 'system',
                      is_system: true,
                    });
                    toastSuccess('状态已更新');
                    queryClient.invalidateQueries({ queryKey: ['tickets'] });
                    queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
                    queryClient.invalidateQueries({ queryKey: ['timeline', ticketId] });
                  }}
                  className="h-7 text-[11px] px-2 text-green-400 hover:text-green-400"
                >
                  <Truck className="w-3.5 h-3.5 mr-1" />已录入Shopify
                </Button>
              )}
              {(isAdmin || isStaff) && (
                <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground">
                      <Archive className="w-3.5 h-3.5 mr-1" />归档
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>归档工单</AlertDialogTitle>
                      <AlertDialogDescription>工单将移入归档，可从「归档」页面恢复。确认归档？</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={handleArchive}>确认归档</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2 text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-1" />删除
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除</AlertDialogTitle>
                      <AlertDialogDescription>删除后不可恢复，确定要删除这个工单吗？</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(ticket.id)} className="bg-destructive hover:bg-destructive/90">删除</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            {/* Mobile: 编辑 + 更多 only */}
            <div className="flex md:hidden items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost" size="sm"
                onClick={() => setIsEditing(e => !e)}
                className={cn('h-7 text-[11px] px-2', isEditing && 'text-primary')}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                {isEditing ? '收起' : '编辑'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowMoreSheet(true)} className="h-7 w-7 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Mobile More Actions Sheet */}
          <Sheet open={showMoreSheet} onOpenChange={setShowMoreSheet}>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader className="mb-4">
                <SheetTitle className="text-[14px]">更多操作</SheetTitle>
              </SheetHeader>
              <div className="space-y-1 pb-4">
                <button
                  onClick={() => { toggleRead(); setShowMoreSheet(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors text-[14px] text-foreground"
                >
                  {isTicketRead ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {isTicketRead ? '标记未读' : '标记已读'}
                </button>
                <button
                  onClick={() => { setShowPODialog(true); setShowMoreSheet(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors text-[14px] text-primary"
                >
                  <ShoppingCart className="w-4 h-4" />发起采购
                </button>
                {canInitiateOutbound && (
                  <button
                    onClick={() => { setShowOutboundDialog(true); setShowMoreSheet(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors text-[14px] text-blue-400"
                  >
                    <PackageMinus className="w-4 h-4" />发起出库
                  </button>
                )}
                {(ticket.status === '待发货') && canInitiateOutbound && (
                  <button
                    onClick={async () => {
                      await base44.entities.Ticket.update(ticket.id, { status: '已发货' });
                      await base44.entities.TimelineEntry.create({
                        ticket_id: String(ticket.id),
                        author_id: currentUser.id,
                        author_name: currentUser.full_name,
                        content: '已录入Shopify，工单完成',
                        entry_type: 'system',
                        is_system: true,
                        });
                        toastSuccess('状态已更新');
                        queryClient.invalidateQueries({ queryKey: ['tickets'] });
                        queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
                        queryClient.invalidateQueries({ queryKey: ['timeline', ticketId] });
                        setShowMoreSheet(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors text-[14px] text-green-400"
                  >
                    <Truck className="w-4 h-4" />已录入Shopify
                  </button>
                )}
                {(isAdmin || isStaff) && (
                  <button
                    onClick={() => { setShowMoreSheet(false); setShowArchiveConfirm(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors text-[14px] text-muted-foreground"
                  >
                    <Archive className="w-4 h-4" />归档工单
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => { setShowMoreSheet(false); setShowDeleteConfirm(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-destructive/10 transition-colors text-[14px] text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />删除工单
                  </button>
                )}
              </div>
            </SheetContent>
          </Sheet>

          {/* Mobile delete confirm */}
          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>删除后不可恢复，确定要删除这个工单吗？</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(ticket.id)} className="bg-destructive hover:bg-destructive/90">删除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Meta row */}
          <div className="flex items-center gap-4 flex-wrap text-[12px]">
            <StatusPill status={ticket.status} size="md" />
            {ticket.ticket_type && <TicketTypePill type={ticket.ticket_type} size="md" />}
            {ticket.order_number && (
              <div className="text-muted-foreground">
                <span className="text-muted-foreground/50">订单号</span> {ticket.order_number}
              </div>
            )}
            {vf.tracking_number && ticket.tracking_number && (
              <div className="text-muted-foreground">
                <span className="text-muted-foreground/50">追踪号</span> {ticket.tracking_number}
              </div>
            )}
            {ticket.linked_outbound_id && <OutboundTrackingBadge outboundId={ticket.linked_outbound_id} />}
            <div className="text-muted-foreground">
              <span className="text-muted-foreground/50">客户</span> {ticket.customer_name || '-'}
            </div>
            {vf.due_date && ticket.due_date && (
              <div className={cn(
                'text-muted-foreground',
                (dueDateOverdue || dueDateToday) && 'text-destructive font-medium'
              )}>
                <span className={cn(
                  'text-muted-foreground/50',
                  (dueDateOverdue || dueDateToday) && 'text-destructive/50'
                )}>截止</span>{' '}
                {moment(ticket.due_date).format('MM-DD HH:mm')}
                {dueDateOverdue && ' (已逾期)'}
                {dueDateToday && ' (今天)'}
              </div>
            )}
            {ticket.assignee_name && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[7px] font-semibold">
                  {getInitials(ticket.assignee_name)}
                </div>
                {ticket.assignee_name}
              </div>
            )}
          </div>
        </div>

        <AiDraftPanel ticket={ticket} currentUser={currentUser} />

        {/* Inline edit panel */}
        {isEditing && (
          <InlineTicketEdit
            ticket={ticket}
            currentUser={currentUser}
            users={users}
            onDone={() => setIsEditing(false)}
          />
        )}

        {/* Status change bar (always visible when not editing) */}
        {!isEditing && (
          <StatusChangeBar ticket={ticket} currentUser={currentUser} />
        )}

        {/* Info grid */}
        {!isEditing && (
          <div className="px-6 py-4 border-b border-thin border-border">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {vf.platform && (
                <InfoItem label="来源平台" value={ticket.platform || '-'} />
              )}
              {vf.customer_contact && (
                <InfoItem label="联系方式" value={ticket.customer_contact || '-'} />
              )}
              <InfoItem label="紧急程度" value={
                <span className={cn(ticket.priority === '紧急' && 'text-destructive font-medium')}>
                  {ticket.priority || '普通'}
                </span>
              } />
              {vf.attachments && (
                <div>
                  <p className="text-[11px] text-muted-foreground/60 mb-1">附件</p>
                  {ticket.attachments?.length > 0 ? (
                    <div className="flex gap-1.5 flex-wrap">
                      {ticket.attachments.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-md border border-thin border-border overflow-hidden hover:opacity-80 transition-opacity"
                        >
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">-</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Internal Notes — admin/staff only */}
        {(isAdmin || isStaff) && !isEditing && (
          <InternalNotes ticket={ticket} currentUser={currentUser} />
        )}

        {/* Timeline */}
        <div className="px-6 py-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">处理时间轴</h3>
          <TimelineSection
            entries={entries}
            currentUserId={currentUser?.id}
            isAdmin={isAdmin}
            onDelete={deleteEntry}
            ticketId={ticketId}
          />
        </div>

        {/* Memo Preview */}
        <TicketMemoPreview currentUser={currentUser} onOpenMemos={onOpenMemos} />
      </div>

      {/* Comment input */}
      <CommentInput onSend={addComment} users={users} />

      <CreatePODialog
        open={showPODialog}
        onClose={() => setShowPODialog(false)}
        currentUser={currentUser}
        prefillProduct={null}
        linkedTicketId={String(ticketId)}
        linkedTicketTitle={ticket?.title}
        onCreated={async (poId, poNumber) => {
          if (poNumber) {
            await base44.entities.TimelineEntry.create({
              ticket_id: String(ticketId),
              author_id: currentUser.id,
              author_name: currentUser.full_name,
              content: `已关联采购单 ${poNumber}`,
              entry_type: 'system',
              is_system: true,
            });
            queryClient.invalidateQueries({ queryKey: ['timeline', ticketId] });
          }
          setShowPODialog(false);
          onInitiatePO?.();
        }}
      />

      <InitiateOutboundDialog
        open={showOutboundDialog}
        onClose={() => setShowOutboundDialog(false)}
        ticket={ticket}
        currentUser={currentUser}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['timeline', ticketId] });
          queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
        }}
      />
    </div>
  );
}

function OutboundTrackingBadge({ outboundId }) {
  const { data: records = [] } = useQuery({
    queryKey: ['outbound_record', outboundId],
    queryFn: () => base44.entities.OutboundRecord.filter({ id: outboundId }),
    select: d => d?.[0],
    enabled: !!outboundId,
  });
  if (!records?.tracking_number) return null;
  return (
    <div className="text-muted-foreground flex items-center gap-1">
      <span className="text-muted-foreground/50">运单号</span>
      <span className="text-foreground font-mono">{records.carrier} {records.tracking_number}</span>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground/60 mb-0.5">{label}</p>
      <div className="text-[13px] text-foreground">{value}</div>
    </div>
  );
}
