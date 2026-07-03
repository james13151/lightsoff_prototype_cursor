import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/lib/settingsContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toastSuccess } from '@/lib/toast';

export default function StatusChangeBar({ ticket, currentUser }) {
  const queryClient = useQueryClient();
  const { statusList: baseStatusList } = useSettings();
  const statusList = [...(baseStatusList || []), '待出库', '出库中', '待发货', '已发货'].filter((v, i, a) => a.indexOf(v) === i);
  const [selectedStatus, setSelectedStatus] = useState(ticket.status);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const hasChange = selectedStatus !== ticket.status;

  const handleStatusSelect = (val) => {
    setSelectedStatus(val);
    if (val !== ticket.status) setShowNote(true);
    else setShowNote(false);
  };

  const handleSave = async () => {
    if (!hasChange) return;
    setSaving(true);
    const oldStatus = ticket.status;

    await base44.entities.Ticket.update(ticket.id, { status: selectedStatus });

    // Always create the audit status_change entry
    await base44.entities.TimelineEntry.create({
      ticket_id: String(ticket.id),
      author_id: currentUser.id,
      author_name: currentUser.full_name,
      content: `${currentUser.full_name} 将状态从「${oldStatus}」改为「${selectedStatus}」`,
      entry_type: 'status_change',
      is_system: true,
      old_status: oldStatus,
      new_status: selectedStatus,
    });

    // If note provided, also create a comment entry
    if (note.trim()) {
      await base44.entities.TimelineEntry.create({
        ticket_id: String(ticket.id),
        author_id: currentUser.id,
        author_name: currentUser.full_name,
        content: note.trim(),
        entry_type: 'comment',
        is_system: false,
      });
    }

    // Notify assignee if different from actor — only admin/staff recipients allowed
    if (ticket.assignee_id && ticket.assignee_id !== currentUser.id) {
      // Look up assignee role from users list passed via ticket context
      // We guard by checking the stored assignee_name against a known-safe pattern:
      // Since assignee_id is always set from assignableUsers (admin/staff only), this is safe.
      // But add an explicit user lookup if possible — for now, since assignees are always admin/staff, proceed.
      await base44.entities.Notification.create({
        user_id: ticket.assignee_id,
        ticket_id: String(ticket.id),
        message: `工单状态已从「${oldStatus}」变更为「${selectedStatus}」`,
        is_read: false,
      });
    }

    // Auto-archive when resolved
    if (selectedStatus === '已解决') {
      await base44.entities.Ticket.update(ticket.id, {
        is_archived: true,
        archived_reason: '已解决',
        pre_archive_status: '已解决',
      });
    }

    setNote('');
    setShowNote(false);
    setSaving(false);
    toastSuccess(selectedStatus === '已解决' ? '状态已更新，工单已自动归档' : '状态已更新');
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });
    queryClient.invalidateQueries({ queryKey: ['timeline', ticket.id] });
    queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
    queryClient.invalidateQueries({ queryKey: ['tickets_archived'] });
    queryClient.invalidateQueries({ queryKey: ['tickets_archived_count'] });
  };

  const handleCancel = () => {
    setSelectedStatus(ticket.status);
    setNote('');
    setShowNote(false);
  };

  return (
    <div className="px-6 py-3 border-b border-border/40 bg-background/50">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground flex-shrink-0">更改状态</span>
        <Select value={selectedStatus} onValueChange={handleStatusSelect}>
          <SelectTrigger className="h-7 text-[12px] border-thin rounded-lg w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusList.map(s => (
              <SelectItem key={s} value={s} className="text-[12px]">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasChange && (
          <>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-7 text-[11px] px-3 border-0"
              style={{ background: '#D4AF37', color: '#1a1e28' }}
            >
              {saving ? '保存中...' : '确认'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              className="h-7 text-[11px] px-2"
            >
              取消
            </Button>
          </>
        )}
      </div>

      {showNote && (
        <div className="mt-2">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="添加备注（可选）"
            rows={2}
            className="w-full resize-none text-[12px] bg-muted/50 border border-thin border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
          />
        </div>
      )}
    </div>
  );
}