import React from 'react';
import { cn } from '@/lib/utils';
import { relativeTime, getInitials } from '@/lib/helpers';
import StatusPill from './StatusPill';
import TicketTypePill from './TicketTypePill';
import { useI18n } from '@/lib/i18nContext';
import ChannelBadge from './ChannelBadge';

export default function TicketCard({ ticket, isActive, isUnread, onClick }) {
  const { locale } = useI18n();
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3.5 border-b border-b-white/[0.06] transition-colors relative',
        isActive ? 'bg-white/[0.07]' : isUnread ? 'bg-white/[0.025] hover:bg-white/[0.05]' : 'hover:bg-white/[0.04]'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0">
            #{(ticket.id || '').slice(0, 8).toUpperCase()}
          </span>
          {isUnread && (
            <span
              className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
              style={{ background: '#D4AF37', color: '#1A1E28' }}
            >
              {locale === 'en' ? 'NEW' : '未读'}
            </span>
          )}
          {ticket.priority === '紧急' && (
            <span className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
          )}
        </div>
        <span className="text-[11px] text-muted-foreground flex-shrink-0">
          {relativeTime(ticket.created_date)}
        </span>
      </div>

      <h3 className="text-[13px] font-medium text-foreground leading-snug mb-2 line-clamp-1">
        {ticket.title}
      </h3>

      {(ticket.channel_type || ticket.ai_summary) && (
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          <ChannelBadge channel={ticket.channel_type} />
          {ticket.ai_summary && (
            <span className="text-[11px] text-muted-foreground truncate">
              {ticket.ai_summary}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {ticket.customer_name && (
            <span className="text-[11px] text-muted-foreground truncate">{ticket.customer_name}</span>
          )}
          {ticket.order_number && (
            <>
              <span className="text-[11px] text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground truncate">{ticket.order_number}</span>
            </>
          )}
          {ticket.platform && (
            <>
              <span className="text-[11px] text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground truncate">{ticket.platform}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {ticket.ticket_type && <TicketTypePill type={ticket.ticket_type} />}
          <StatusPill status={ticket.status} />
          {ticket.assignee_name && (
            <div className="w-5 h-5 rounded-full bg-accent text-[9px] font-medium text-muted-foreground flex items-center justify-center">
              {getInitials(ticket.assignee_name)}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
