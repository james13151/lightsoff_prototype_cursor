import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { getInitials, relativeTime } from '@/lib/helpers';
import { Trash2, Pencil, Check, X, Bot, MessageSquare, Send } from 'lucide-react';
import StatusPill from './StatusPill';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import { toastSuccess } from '@/lib/toast';

// Dot color per new status
const STATUS_DOT = {
  '待处理':     '#93c5fd',
  '处理中':     '#fcd34d',
  '待客户回复': '#f9a8d4',
  '已解决':     '#86efac',
};

export default function TimelineSection({ entries, currentUserId, isAdmin, onDelete, ticketId }) {
  if (!entries?.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-[13px] text-muted-foreground">暂无时间轴记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, idx) => (
        <TimelineEntry
          key={entry.id}
          entry={entry}
          idx={idx}
          total={entries.length}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onDelete={onDelete}
          ticketId={ticketId}
        />
      ))}
    </div>
  );
}

function TimelineEntry({ entry, idx, total, currentUserId, isAdmin, onDelete, ticketId }) {
  const queryClient = useQueryClient();
  const isSystem = entry.entry_type !== 'comment';
  const isStatusChange = entry.entry_type === 'status_change';
  const isAssignment = entry.entry_type === 'assignment';
  const isChannelMessage = entry.entry_type === 'channel_message';
  const isAiDraft = entry.entry_type === 'ai_draft';
  const isSendAttempt = entry.entry_type === 'send_attempt';

  // Deletion: only comment entries, and only by author or admin. System entries (is_system) never deletable.
  const canDelete = !entry.is_system && entry.entry_type === 'comment' &&
    (entry.author_id === currentUserId || isAdmin);

  // Edit: comment author within 24h, or admin anytime
  const withinEditWindow = moment().diff(moment(entry.created_date), 'hours') < 24;
  const canEdit = !entry.is_system && entry.entry_type === 'comment' &&
    (isAdmin || (entry.author_id === currentUserId && withinEditWindow));

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(entry.content);
  const [saving, setSaving] = useState(false);

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    await base44.entities.TimelineEntry.update(entry.id, {
      content: editText.trim(),
      is_edited: true,
    });
    setSaving(false);
    setEditing(false);
    toastSuccess('备注已更新');
    queryClient.invalidateQueries({ queryKey: ['timeline', ticketId] });
  };

  // Dot color
  let dotColor = '#6b7280'; // gray for system/assignment
  if (isStatusChange && entry.new_status) {
    dotColor = STATUS_DOT[entry.new_status] || '#6b7280';
  } else if (isAiDraft) {
    dotColor = '#C49A1A';
  } else if (isSendAttempt) {
    dotColor = entry.send_status === 'failed'
      ? '#dc2626'
      : entry.send_status === 'blocked'
        ? '#d97706'
        : '#16a34a';
  } else if (isChannelMessage) {
    dotColor = '#2563eb';
  } else if (!isSystem) {
    dotColor = 'rgba(212,175,55,0.8)'; // gold for comments
  }

  return (
    <div className="group relative flex gap-3 pb-5">
      {/* Connector line */}
      {idx < total - 1 && (
        <div className="absolute left-[10px] top-6 bottom-0 w-px bg-border/50" />
      )}

      {/* Dot */}
      <div className="w-[21px] h-[21px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${dotColor}20`, border: `1.5px solid ${dotColor}40` }}>
        {isAiDraft ? (
          <Bot className="w-3 h-3" style={{ color: dotColor }} />
        ) : isSendAttempt ? (
          <Send className="w-3 h-3" style={{ color: dotColor }} />
        ) : isChannelMessage ? (
          <MessageSquare className="w-3 h-3" style={{ color: dotColor }} />
        ) : isStatusChange || (isSystem && !isAssignment) ? (
          <div className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
        ) : (
          <span className="text-[8px] font-semibold" style={{ color: dotColor }}>
            {getInitials(entry.author_name)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'text-[12px] font-medium',
              isSystem ? 'text-muted-foreground' : 'text-foreground'
            )}>
              {entry.author_name || '系统'}
            </span>
            <span className="text-[11px] text-muted-foreground/50">
              {relativeTime(entry.created_date)}
            </span>
            {entry.is_edited && (
              <span className="text-[10px] text-muted-foreground/40 italic">已编辑</span>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && !editing && (
              <button
                onClick={() => { setEditText(entry.content); setEditing(true); }}
                className="p-1 rounded hover:bg-white/[0.06] transition-colors"
              >
                <Pencil className="w-3 h-3 text-muted-foreground/60" />
              </button>
            )}
            {canDelete && !editing && (
              <button
                onClick={() => onDelete(entry.id)}
                className="p-1 rounded hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3 h-3 text-destructive/60" />
              </button>
            )}
          </div>
        </div>

        {/* Status change display */}
        {isChannelMessage ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 mt-1">
            <p className="text-[13px] leading-relaxed text-blue-950 whitespace-pre-wrap">{entry.content}</p>
          </div>
        ) : isAiDraft ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 mt-1">
            <p className="text-[13px] leading-relaxed text-amber-950 whitespace-pre-wrap">{entry.content}</p>
          </div>
        ) : isSendAttempt ? (
          <div className={cn(
            'rounded-lg border px-3 py-2 mt-1',
            entry.send_status === 'failed'
              ? 'border-red-200 bg-red-50'
              : entry.send_status === 'blocked'
                ? 'border-amber-200 bg-amber-50'
                : 'border-emerald-200 bg-emerald-50'
          )}>
            <p className={cn(
              'text-[13px] leading-relaxed whitespace-pre-wrap',
              entry.send_status === 'failed'
                ? 'text-red-950'
                : entry.send_status === 'blocked'
                  ? 'text-amber-950'
                  : 'text-emerald-950'
            )}>{entry.content}</p>
          </div>
        ) : isStatusChange ? (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] text-muted-foreground">状态变更：</span>
            {entry.old_status && (
              <>
                <span className="text-[11px] text-muted-foreground line-through opacity-60">
                  {entry.old_status}
                </span>
                <span className="text-muted-foreground/40 text-[11px]">→</span>
              </>
            )}
            {entry.new_status && <StatusPill status={entry.new_status} size="sm" />}
          </div>
        ) : editing ? (
          <div className="mt-1">
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={2}
              className="w-full resize-none text-[13px] bg-muted/50 border border-thin border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="text-[11px] text-primary flex items-center gap-1 hover:opacity-80"
              >
                <Check className="w-3 h-3" /> 保存
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-[11px] text-muted-foreground flex items-center gap-1 hover:opacity-80"
              >
                <X className="w-3 h-3" /> 取消
              </button>
            </div>
          </div>
        ) : (
          <p className={cn(
            'text-[13px] leading-relaxed',
            isSystem ? 'text-muted-foreground italic' : 'text-foreground'
          )}>
            {entry.content}
          </p>
        )}
      </div>
    </div>
  );
}
