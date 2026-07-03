import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Search, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/lib/helpers';
import TicketTypePill from '@/components/tickets/TicketTypePill';
import TicketDetail from '@/components/tickets/TicketDetail';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toastSuccess } from '@/lib/toast';
import { isAdmin } from '@/lib/permissions';

export default function ArchivePage({ currentUser, users, onDelete }) {
  const queryClient = useQueryClient();
  const userIsAdmin = isAdmin(currentUser);
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('全部');
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirm2, setDeleteConfirm2] = useState(false);

  const { data: archived = [] } = useQuery({
    queryKey: ['tickets_archived'],
    queryFn: () => base44.entities.Ticket.filter({ is_archived: true }, '-updated_date', 500),
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    let list = archived;
    if (filterReason !== '全部') list = list.filter(t => t.archived_reason === filterReason);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.order_number || '').toLowerCase().includes(q) ||
        (t.customer_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [archived, filterReason, search]);

  const handleRestore = async (ticket) => {
    await base44.entities.Ticket.update(ticket.id, {
      is_archived: false,
      archived_reason: null,
      status: ticket.pre_archive_status || '待处理',
      pre_archive_status: null,
    });
    await base44.entities.TimelineEntry.create({
      ticket_id: String(ticket.id),
      author_id: currentUser.id,
      author_name: currentUser.full_name,
      content: '从归档中恢复',
      entry_type: 'system',
      is_system: true,
    });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['tickets_archived'] });
    toastSuccess('工单已恢复');
    if (selectedId === ticket.id) setSelectedId(null);
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    const entries = await base44.entities.TimelineEntry.filter({ ticket_id: String(deleteTarget.id) });
    for (const e of entries) await base44.entities.TimelineEntry.delete(e.id);
    await base44.entities.Ticket.delete(deleteTarget.id);
    queryClient.invalidateQueries({ queryKey: ['tickets_archived'] });
    toastSuccess('工单已永久删除');
    setDeleteTarget(null);
    setDeleteConfirm2(false);
    if (selectedId === deleteTarget.id) setSelectedId(null);
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Left: archive list */}
      <div className="w-full md:w-[320px] md:min-w-[320px] flex flex-col border-r border-thin border-border overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-5 pb-3 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">归档 · Archive</h2>
            <span className="text-[12px] text-muted-foreground">{archived.length} 条</span>
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
          {/* Filter chips */}
          <div className="flex gap-1">
            {['全部', '已解决', '已删除'].map(f => (
              <button
                key={f}
                onClick={() => setFilterReason(f)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                  filterReason === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-[13px] text-muted-foreground">暂无归档工单</p>
            </div>
          ) : (
            filtered.map(ticket => (
              <div
                key={ticket.id}
                className={cn(
                  'w-full text-left px-4 py-3.5 border-b border-b-white/[0.06] transition-colors relative cursor-pointer',
                  selectedId === ticket.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
                )}
                onClick={() => setSelectedId(ticket.id)}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0">
                      #{(ticket.id || '').slice(0, 8).toUpperCase()}
                    </span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0',
                      ticket.archived_reason === '已删除'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-muted/50 text-muted-foreground'
                    )}>
                      {ticket.archived_reason || '已归档'}
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0">
                    {relativeTime(ticket.updated_date)}
                  </span>
                </div>
                <h3 className="text-[13px] font-medium text-muted-foreground/80 line-clamp-1 mb-2">
                  {ticket.title}
                </h3>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground truncate">{ticket.customer_name || ''}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {ticket.ticket_type && <TicketTypePill type={ticket.ticket_type} />}
                    {userIsAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRestore(ticket); }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="恢复"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                    {userIsAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(ticket); }}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="永久删除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: ticket detail (read-only context in archive) */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {selectedId ? (
          <TicketDetail
            ticketId={selectedId}
            currentUser={currentUser}
            users={users}
            onDelete={() => {}} // no direct delete from archive detail — use list buttons
            onOpenMemos={() => {}}
            onInitiatePO={() => {}}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-[13px]">从左侧选择归档工单查看详情</p>
          </div>
        )}
      </div>

      {/* First delete confirm */}
      <AlertDialog open={!!deleteTarget && !deleteConfirm2} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除确认</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。确定要永久删除工单「{deleteTarget?.title}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => setDeleteConfirm2(true)} className="bg-destructive hover:bg-destructive/90">
              继续
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Second (final) delete confirm */}
      <AlertDialog open={deleteConfirm2} onOpenChange={open => { if (!open) { setDeleteConfirm2(false); setDeleteTarget(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ 最终确认</AlertDialogTitle>
            <AlertDialogDescription>
              此操作<strong>完全不可逆</strong>。工单及所有关联数据将被永久删除，无法恢复。确认吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDeleteConfirm2(false); setDeleteTarget(null); }}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-destructive hover:bg-destructive/90">
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}