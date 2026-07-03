import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { X, Plus, Paperclip, ChevronDown, Lock, Send, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusPillPlanner from './StatusPillPlanner';
import PriorityDot from './PriorityDot';
import UserAvatar from './UserAvatar';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { isAdmin, isStaff } from '@/lib/permissions';

export default function TaskDetailPanel({ taskId, allTasks, taskStatuses, taskCategories, taskModules, users, currentUser, onClose, onTaskUpdated, isBlocked, completionStatusNames, getTaskProgress }) {
  const queryClient = useQueryClient();
  const [task, setTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [depSearch, setDepSearch] = useState('');
  const [linkSearch, setLinkSearch] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleRef = useRef(null);

  const { data: activities = [] } = useQuery({
    queryKey: ['task_activities', taskId],
    queryFn: () => base44.entities.TaskActivity.filter({ task_id: taskId }, 'created_date', 200),
    enabled: !!taskId,
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => base44.entities.Ticket.list('-created_date', 500),
  });

  const { data: pos = [] } = useQuery({
    queryKey: ['purchase_orders'],
    queryFn: () => base44.entities.PurchaseOrder.list('-created_date', 200),
  });

  useEffect(() => {
    const t = allTasks.find(t => t.id === taskId);
    if (t) setTask({ ...t });
  }, [taskId, allTasks]);

  if (!task) return null;

  const canEdit = isAdmin(currentUser) || isStaff(currentUser);
  const children = allTasks.filter(t => t.parent_task_id === taskId);
  const progress = getTaskProgress(taskId);
  const blocked = isBlocked(task);
  const blockedByTasks = (task.dependencies || []).map(depId => allTasks.find(t => t.id === depId)).filter(Boolean);
  const blockingTasks = allTasks.filter(t => (t.dependencies || []).includes(taskId));

  const saveField = async (field, value) => {
    if (!canEdit) return;
    setSaving(true);
    const updated = { ...task, [field]: value };
    setTask(updated);

    // Log activity for status/assignee changes
    if (field === 'status' && task.status !== value) {
      await base44.entities.TaskActivity.create({
        task_id: taskId,
        author_id: currentUser?.id,
        author_name: currentUser?.full_name,
        entry_type: 'status_change',
        content: `状态从「${task.status || '未设置'}」变更为「${value}」`,
        old_value: task.status,
        new_value: value,
      });
      queryClient.invalidateQueries({ queryKey: ['task_activities', taskId] });

      // Auto-assign if status has default assignee and no current assignee
      const statusInfo = taskStatuses.find(s => s.name === value);
      if (statusInfo?.default_assignee_id && !task.assignee_id) {
        updated.assignee_id = statusInfo.default_assignee_id;
        updated.assignee_name = statusInfo.default_assignee_name;
        setTask(updated);
      }
    }
    if (field === 'assignee_id') {
      const assignee = users.find(u => u.id === value);
      updated.assignee_name = assignee?.full_name || '';
      updated.assignee_id = value;
      setTask(updated);
      await base44.entities.TaskActivity.create({
        task_id: taskId,
        author_id: currentUser?.id,
        author_name: currentUser?.full_name,
        entry_type: 'assignment',
        content: `负责人变更为「${assignee?.full_name || '未指定'}」`,
        new_value: assignee?.full_name,
      });
      queryClient.invalidateQueries({ queryKey: ['task_activities', taskId] });
    }

    await base44.entities.Task.update(taskId, updated);
    onTaskUpdated();
    setSaving(false);
  };

  const saveTitle = async () => {
    if (!task.title.trim()) return;
    await base44.entities.Task.update(taskId, { title: task.title });
    onTaskUpdated();
    setEditingTitle(false);
  };

  const addDependency = async (depTaskId) => {
    if ((task.dependencies || []).includes(depTaskId)) return;
    // Circular dep check
    const wouldCreateCycle = checkCycle(depTaskId, taskId, allTasks);
    if (wouldCreateCycle) {
      toast.error('检测到循环依赖，无法添加');
      return;
    }
    const newDeps = [...(task.dependencies || []), depTaskId];
    await saveField('dependencies', newDeps);
    setDepSearch('');
  };

  const removeDependency = async (depTaskId) => {
    const newDeps = (task.dependencies || []).filter(id => id !== depTaskId);
    await saveField('dependencies', newDeps);
  };

  const addSubtask = async () => {
    if (!subtaskTitle.trim()) return;
    const created = await base44.entities.Task.create({
      title: subtaskTitle.trim(),
      parent_task_id: taskId,
      status: taskStatuses[0]?.name || '待办',
      category: task.category,
      module: task.module,
      created_by_id: currentUser?.id,
      created_by_name: currentUser?.full_name,
    });
    setSubtaskTitle('');
    setAddingSubtask(false);
    onTaskUpdated();
    toast.success('子任务已创建');
  };

  const sendComment = async () => {
    if (!commentText.trim()) return;
    await base44.entities.TaskActivity.create({
      task_id: taskId,
      author_id: currentUser?.id,
      author_name: currentUser?.full_name,
      entry_type: 'comment',
      content: commentText.trim(),
    });
    setCommentText('');
    queryClient.invalidateQueries({ queryKey: ['task_activities', taskId] });
  };

  const uploadAttachment = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const newAtts = [...(task.attachments || []), file_url];
    await saveField('attachments', newAtts);
    setUploadingFile(false);
    toast.success('附件已上传');
  };

  const removeAttachment = async (url) => {
    const newAtts = (task.attachments || []).filter(u => u !== url);
    await saveField('attachments', newAtts);
  };

  const addLinkedTicket = async (ticketId) => {
    const linked = [...(task.linked_tickets || [])];
    if (!linked.includes(ticketId)) {
      await saveField('linked_tickets', [...linked, ticketId]);
    }
  };

  const addLinkedPO = async (poId) => {
    const linked = [...(task.linked_pos || [])];
    if (!linked.includes(poId)) {
      await saveField('linked_pos', [...linked, poId]);
    }
  };

  const sortedStatuses = [...taskStatuses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="w-[380px] min-w-[380px] border-l border-border/50 flex flex-col overflow-hidden" style={{ background: '#fff', height: '100%' }}>
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-border/50 flex-shrink-0">
        <div className="flex-1 min-w-0 mr-2">
          {editingTitle ? (
            <input
              ref={titleRef}
              value={task.title}
              onChange={e => setTask(t => ({ ...t, title: e.target.value }))}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
              className="w-full text-[15px] font-semibold text-foreground border-b border-primary outline-none bg-transparent"
              autoFocus
            />
          ) : (
            <h2
              className={cn('text-[15px] font-semibold text-foreground leading-snug', canEdit && 'cursor-text hover:underline decoration-dotted')}
              onClick={() => canEdit && setEditingTitle(true)}
            >
              {task.title}
            </h2>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Quick header fields */}
        <div className="px-4 py-3 border-b border-border/30 grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">状态</label>
            <Select value={task.status || ''} onValueChange={v => saveField('status', v)} disabled={!canEdit}>
              <SelectTrigger className="h-7 text-[12px] border-thin">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortedStatuses.map(s => (
                  <SelectItem key={s.id} value={s.name}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">优先级</label>
            <Select value={task.priority || '普通'} onValueChange={v => saveField('priority', v)} disabled={!canEdit}>
              <SelectTrigger className="h-7 text-[12px] border-thin">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['普通', '重要', '紧急', '关键'].map(p => (
                  <SelectItem key={p} value={p}>
                    <div className="flex items-center gap-2">
                      <PriorityDot priority={p} />
                      {p}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1 block">负责人</label>
            <Select value={task.assignee_id || ''} onValueChange={v => saveField('assignee_id', v)} disabled={!canEdit}>
              <SelectTrigger className="h-7 text-[12px] border-thin">
                <SelectValue placeholder="未指定" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>未指定</SelectItem>
                {users.filter(u => u.role === 'admin' || u.role === 'staff').map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    <div className="flex items-center gap-2">
                      <UserAvatar user={u} size={16} />
                      {u.full_name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Blocked warning */}
        {blocked && (
          <div className="mx-4 my-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
            <span className="text-[11px] text-amber-700">此任务被依赖阻塞，无法开始</span>
          </div>
        )}

        {/* Dates */}
        <Section title="时间">
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="开始日期">
              <Input type="date" value={task.start_date || ''} onChange={e => saveField('start_date', e.target.value)} className="h-7 text-[12px] border-thin" disabled={!canEdit} />
            </FieldRow>
            <FieldRow label="截止日期">
              <Input type="date" value={task.due_date || ''} onChange={e => saveField('due_date', e.target.value)} className="h-7 text-[12px] border-thin" disabled={!canEdit} />
            </FieldRow>
          </div>
        </Section>

        {/* Classification */}
        <Section title="分类">
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="分类">
              <Select value={task.category || ''} onValueChange={v => saveField('category', v)} disabled={!canEdit}>
                <SelectTrigger className="h-7 text-[12px] border-thin"><SelectValue placeholder="未分类" /></SelectTrigger>
                <SelectContent>
                  {taskCategories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="模块">
              <Select value={task.module || ''} onValueChange={v => saveField('module', v)} disabled={!canEdit}>
                <SelectTrigger className="h-7 text-[12px] border-thin"><SelectValue placeholder="未选择" /></SelectTrigger>
                <SelectContent>
                  {taskModules.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="工作类型">
              <Select value={task.responsible_type || '我方'} onValueChange={v => saveField('responsible_type', v)} disabled={!canEdit}>
                <SelectTrigger className="h-7 text-[12px] border-thin"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="我方">我方</SelectItem>
                  <SelectItem value="外协">外协</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="关键联系人">
              <Input value={task.key_person || ''} onChange={e => setTask(t => ({ ...t, key_person: e.target.value }))} onBlur={() => saveField('key_person', task.key_person)} className="h-7 text-[12px] border-thin" disabled={!canEdit} placeholder="姓名" />
            </FieldRow>
          </div>
        </Section>

        {/* Details */}
        <Section title="详情">
          <FieldRow label="当前情况">
            <Textarea
              value={task.current_situation || ''}
              onChange={e => setTask(t => ({ ...t, current_situation: e.target.value }))}
              onBlur={() => saveField('current_situation', task.current_situation)}
              className="text-[12px] border-thin min-h-[60px] resize-none"
              disabled={!canEdit}
              placeholder="描述当前情况..."
            />
          </FieldRow>
          <FieldRow label="下一步">
            <Textarea
              value={task.next_step || ''}
              onChange={e => setTask(t => ({ ...t, next_step: e.target.value }))}
              onBlur={() => saveField('next_step', task.next_step)}
              className="text-[12px] border-thin min-h-[60px] resize-none"
              disabled={!canEdit}
              placeholder="计划下一步行动..."
            />
          </FieldRow>
          <FieldRow label="备注">
            <Textarea
              value={task.notes || ''}
              onChange={e => setTask(t => ({ ...t, notes: e.target.value }))}
              onBlur={() => saveField('notes', task.notes)}
              className="text-[12px] border-thin min-h-[50px] resize-none"
              disabled={!canEdit}
              placeholder="备注..."
            />
          </FieldRow>
        </Section>

        {/* Dependencies */}
        <Section title="依赖关系">
          {blockedByTasks.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-muted-foreground mb-1.5">此任务等待完成：</p>
              {blockedByTasks.map(dep => (
                <div key={dep.id} className="flex items-center gap-2 py-1">
                  <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  <span className="text-[12px] text-foreground flex-1 truncate">{dep.title}</span>
                  <StatusPillPlanner status={dep.status} statusInfo={taskStatuses.find(s => s.name === dep.status)} />
                  {canEdit && (
                    <button onClick={() => removeDependency(dep.id)} className="text-muted-foreground hover:text-destructive ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {blockingTasks.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-muted-foreground mb-1.5">以下任务依赖此任务：</p>
              {blockingTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1">
                  <span className="text-[12px] text-foreground flex-1 truncate">{t.title}</span>
                  <StatusPillPlanner status={t.status} statusInfo={taskStatuses.find(s => s.name === t.status)} />
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={depSearch}
                onChange={e => setDepSearch(e.target.value)}
                placeholder="搜索并添加依赖任务..."
                className="h-7 pl-7 text-[12px] border-thin"
              />
              {depSearch && (
                <div className="absolute top-full left-0 right-0 bg-white border border-border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto mt-1">
                  {allTasks.filter(t => t.id !== taskId && t.title.toLowerCase().includes(depSearch.toLowerCase())).slice(0, 8).map(t => (
                    <button
                      key={t.id}
                      onClick={() => addDependency(t.id)}
                      className="w-full text-left px-3 py-2 text-[12px] hover:bg-muted flex items-center gap-2"
                    >
                      <span className="flex-1 truncate">{t.title}</span>
                      <StatusPillPlanner status={t.status} statusInfo={taskStatuses.find(s => s.name === t.status)} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Subtasks */}
        <Section title={`子任务 ${children.length > 0 ? `(${progress?.done || 0}/${children.length})` : ''}`}>
          {progress && (
            <div className="mb-2">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{progress.pct}% 已完成</p>
            </div>
          )}
          {children.map(child => {
            const statusInfo = taskStatuses.find(s => s.name === child.status);
            return (
              <div key={child.id} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                <span className="text-[12px] text-foreground flex-1 truncate">{child.title}</span>
                <StatusPillPlanner status={child.status} statusInfo={statusInfo} />
              </div>
            );
          })}
          {canEdit && (
            addingSubtask ? (
              <div className="flex gap-2 mt-2">
                <Input
                  value={subtaskTitle}
                  onChange={e => setSubtaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') setAddingSubtask(false); }}
                  placeholder="子任务标题..."
                  className="h-7 text-[12px] border-thin flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={addSubtask} className="h-7 text-[11px] px-2">添加</Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingSubtask(false)} className="h-7 text-[11px] px-2">取消</Button>
              </div>
            ) : (
              <button
                onClick={() => setAddingSubtask(true)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary mt-2 transition-colors"
              >
                <Plus className="w-3 h-3" /> 添加子任务
              </button>
            )
          )}
        </Section>

        {/* Links */}
        <Section title="关联">
          {(task.linked_tickets || []).length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-muted-foreground mb-1">关联工单：</p>
              {(task.linked_tickets || []).map(tid => {
                const ticket = tickets.find(t => t.id === tid);
                return ticket ? (
                  <div key={tid} className="flex items-center gap-2 py-1">
                    <span className="text-[12px] text-foreground flex-1 truncate">{ticket.title}</span>
                    <span className="text-[10px] text-muted-foreground">{ticket.status}</span>
                    {canEdit && (
                      <button onClick={() => saveField('linked_tickets', (task.linked_tickets || []).filter(i => i !== tid))} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    )}
                  </div>
                ) : null;
              })}
            </div>
          )}
          {(task.linked_pos || []).length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-muted-foreground mb-1">关联采购单：</p>
              {(task.linked_pos || []).map(pid => {
                const po = pos.find(p => p.id === pid);
                return po ? (
                  <div key={pid} className="flex items-center gap-2 py-1">
                    <span className="text-[12px] text-foreground flex-1 truncate">{po.po_number || po.supplier_name}</span>
                    <span className="text-[10px] text-muted-foreground">{po.production_status}</span>
                    {canEdit && (
                      <button onClick={() => saveField('linked_pos', (task.linked_pos || []).filter(i => i !== pid))} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    )}
                  </div>
                ) : null;
              })}
            </div>
          )}
          {canEdit && (
            <div className="relative">
              <Input
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                placeholder="搜索工单或采购单..."
                className="h-7 text-[12px] border-thin"
              />
              {linkSearch && (
                <div className="absolute top-full left-0 right-0 bg-white border border-border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto mt-1">
                  {tickets.filter(t => t.title?.toLowerCase().includes(linkSearch.toLowerCase())).slice(0, 4).map(t => (
                    <button key={t.id} onClick={() => { addLinkedTicket(t.id); setLinkSearch(''); }} className="w-full text-left px-3 py-2 text-[12px] hover:bg-muted flex items-center gap-2">
                      <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">工单</span>
                      <span className="flex-1 truncate">{t.title}</span>
                    </button>
                  ))}
                  {pos.filter(p => (p.po_number || p.supplier_name)?.toLowerCase().includes(linkSearch.toLowerCase())).slice(0, 4).map(p => (
                    <button key={p.id} onClick={() => { addLinkedPO(p.id); setLinkSearch(''); }} className="w-full text-left px-3 py-2 text-[12px] hover:bg-muted flex items-center gap-2">
                      <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">采购</span>
                      <span className="flex-1 truncate">{p.po_number || p.supplier_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Attachments */}
        <Section title="附件">
          {(task.attachments || []).map((url, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              <Paperclip className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-primary flex-1 truncate hover:underline">
                附件 {i + 1}
              </a>
              {canEdit && (
                <button onClick={() => removeAttachment(url)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
              )}
            </div>
          ))}
          {canEdit && (
            <label className="mt-1 cursor-pointer inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors">
              <input type="file" className="hidden" onChange={uploadAttachment} />
              <Plus className="w-3 h-3" />
              {uploadingFile ? '上传中...' : '添加附件'}
            </label>
          )}
        </Section>

        {/* Activity */}
        <Section title="活动记录">
          <div className="space-y-3 mb-3">
            {activities.map(act => (
              <div key={act.id} className="flex gap-2">
                <UserAvatar user={users.find(u => u.id === act.author_id)} size={22} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-medium text-foreground">{act.author_name}</span>
                    <span className="text-[10px] text-muted-foreground">{act.created_date ? format(new Date(act.created_date), 'MM/dd HH:mm') : ''}</span>
                  </div>
                  <p className="text-[12px] text-foreground leading-relaxed">{act.content}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t border-border/30 pt-3">
            <Input
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
              placeholder="添加评论..."
              className="flex-1 h-8 text-[12px] border-thin"
            />
            <Button size="sm" onClick={sendComment} className="h-8 px-3">
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </Section>

        {/* Delete (admin only) */}
        {isAdmin(currentUser) && (
          <div className="px-4 py-3 border-t border-border/30">
            <button
              onClick={async () => {
                await base44.entities.Task.update(taskId, { is_archived: true });
                onTaskUpdated();
                onClose();
                toast.success('任务已归档');
              }}
              className="text-[12px] text-destructive hover:underline flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> 归档任务
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-border/30">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors"
      >
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="px-4 pb-3 pt-1">{children}</div>}
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className="mb-2">
      <label className="text-[10px] text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function checkCycle(startId, targetId, allTasks) {
  // DFS: starting from startId, can we reach targetId via dependencies?
  const visited = new Set();
  const stack = [startId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === targetId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const task = allTasks.find(t => t.id === current);
    (task?.dependencies || []).forEach(dep => stack.push(dep));
  }
  return false;
}