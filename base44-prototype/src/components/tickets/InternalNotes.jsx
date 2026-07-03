import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Textarea } from '@/components/ui/textarea';
import { relativeTime } from '@/lib/helpers';
import { cn } from '@/lib/utils';

export default function InternalNotes({ ticket, currentUser }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(ticket?.internal_notes || '');
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef(ticket?.internal_notes || '');

  // Sync when ticket changes
  useEffect(() => {
    setValue(ticket?.internal_notes || '');
    lastSavedRef.current = ticket?.internal_notes || '';
  }, [ticket?.id, ticket?.internal_notes]);

  const handleBlur = async () => {
    if (value === lastSavedRef.current) return; // no change
    setSaving(true);
    await base44.entities.Ticket.update(ticket.id, {
      internal_notes: value,
      internal_notes_updated_by: currentUser.full_name,
      internal_notes_updated_at: new Date().toISOString(),
    });
    lastSavedRef.current = value;
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  };

  return (
    <div className="px-6 py-4 border-b border-thin border-border">
      <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">内部备注 · Internal Notes</p>
      <Textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="添加内部备注… / Add internal notes…"
        className={cn(
          'w-full min-h-[80px] text-[13px] bg-muted/20 border-thin rounded-lg resize-none',
          'placeholder:text-muted-foreground/40'
        )}
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className={cn('text-[10px]', saving ? 'text-primary' : 'text-transparent')}>
          保存中…
        </span>
        {ticket?.internal_notes_updated_by && (
          <span className="text-[10px] text-muted-foreground/50">
            {ticket.internal_notes_updated_by} · {relativeTime(ticket.internal_notes_updated_at)}
          </span>
        )}
      </div>
    </div>
  );
}