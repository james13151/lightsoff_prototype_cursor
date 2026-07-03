import React, { useState, useRef, useEffect } from 'react';
import { Search, Plus, Bell, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import TicketCard from './TicketCard';
import { cn } from '@/lib/utils';

const FILTER_ALL = '全部';
// 已解决 is excluded from main list (goes to archive) so not shown as a filter
const MAIN_STATUSES = ['待处理', '处理中', '待客户回复', '待出库', '出库中', '待发货'];

export default function TicketList({
  tickets,
  statusList,
  selectedTicketId,
  currentUserId,
  unreadNotifCount,
  onSelectTicket,
  onCreateNew,
  onOpenNotifications,
  pageTitle,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [typeFilter, setTypeFilter] = useState(FILTER_ALL);
  const [sortBy, setSortBy] = useState('created');
  const [showMoreStatuses, setShowMoreStatuses] = useState(false);
  const moreRef = useRef(null);

  const TICKET_TYPES = ['投诉', '退货', '物流异常', '咨询'];

  // Split statuses into main row and overflow
  const mainStatuses = statusList.filter(s => MAIN_STATUSES.includes(s));
  const extraStatuses = statusList.filter(s => !MAIN_STATUSES.includes(s));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setShowMoreStatuses(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = tickets
    .filter(t => {
      if (statusFilter !== FILTER_ALL && t.status !== statusFilter) return false;
      if (typeFilter !== FILTER_ALL && t.ticket_type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (t.title || '').toLowerCase().includes(q) ||
          (t.order_number || '').toLowerCase().includes(q) ||
          (t.customer_name || '').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'due') {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      }
      return new Date(b.created_date) - new Date(a.created_date);
    });

  const activeFilterIsExtra = extraStatuses.includes(statusFilter);

  return (
    <div className="w-full md:w-[320px] md:min-w-[320px] flex-1 md:flex-none md:h-full flex flex-col border-r border-thin border-border bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">{pageTitle}</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenNotifications}
              className="relative p-1.5 rounded-md hover:bg-accent transition-colors"
            >
              <Bell className="w-4 h-4 text-muted-foreground" />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" />
              )}
            </button>
            <Button size="sm" onClick={onCreateNew} className="h-7 text-[12px] px-2.5 rounded-md">
              <Plus className="w-3.5 h-3.5 mr-1" />
              新建工单
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索标题、订单号、客户..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-[12px] rounded-md border-thin bg-muted/50"
          />
        </div>
      </div>

      {/* Status filter row — horizontally scrollable, no wrap */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
          {/* All */}
          <button
            onClick={() => setStatusFilter(FILTER_ALL)}
            className={cn(
              'flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap',
              statusFilter === FILTER_ALL
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            全部
          </button>
          {/* Main statuses */}
          {mainStatuses.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                'flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap',
                statusFilter === f
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent'
              )}
            >
              {f}
            </button>
          ))}
          {/* More dropdown */}
          {extraStatuses.length > 0 && (
            <div ref={moreRef} className="relative flex-shrink-0">
              <button
                onClick={() => setShowMoreStatuses(s => !s)}
                className={cn(
                  'flex items-center gap-0.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap',
                  (showMoreStatuses || activeFilterIsExtra)
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-accent'
                )}
              >
                更多
                <ChevronDown className={cn('w-3 h-3 transition-transform', showMoreStatuses && 'rotate-180')} />
              </button>
              {showMoreStatuses && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[100px]">
                  {extraStatuses.map(f => (
                    <button
                      key={f}
                      onClick={() => { setStatusFilter(f); setShowMoreStatuses(false); }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-[12px] transition-colors whitespace-nowrap',
                        statusFilter === f ? 'text-primary font-medium' : 'text-foreground hover:bg-accent'
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Type filter row — horizontally scrollable, no wrap */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
          {[FILTER_ALL, ...TICKET_TYPES].map(tp => (
            <button
              key={tp}
              onClick={() => setTypeFilter(tp)}
              className={cn(
                'flex-shrink-0 px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-colors whitespace-nowrap',
                typeFilter === tp
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground/70 hover:bg-accent'
              )}
            >
              {tp === FILTER_ALL ? '全部类型' : tp}
            </button>
          ))}
        </div>
      </div>

      {/* Sort */}
      <div className="px-4 pb-2 flex items-center gap-2">
        <button
          onClick={() => setSortBy('created')}
          className={cn('text-[11px] transition-colors', sortBy === 'created' ? 'text-foreground font-medium' : 'text-muted-foreground')}
        >
          按创建时间
        </button>
        <span className="text-[11px] text-muted-foreground/40">|</span>
        <button
          onClick={() => setSortBy('due')}
          className={cn('text-[11px] transition-colors', sortBy === 'due' ? 'text-foreground font-medium' : 'text-muted-foreground')}
        >
          按截止日期
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px] text-muted-foreground">暂无工单</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">试试调整筛选条件</p>
          </div>
        ) : (
          filtered.map(ticket => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              isActive={ticket.id === selectedTicketId}
              isUnread={!ticket.read_by?.includes(currentUserId)}
              onClick={() => onSelectTicket(ticket.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}