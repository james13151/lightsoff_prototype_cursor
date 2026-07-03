import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function CreateTaskDialog({ open, defaults, taskStatuses, taskCategories, taskModules, users, currentUser, allTasks, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    status: taskStatuses[0]?.name || '待办',
    priority: '普通',
    category: defaults.category || '',
    module: '',
    assignee_id: '',
    responsible_type: '我方',
    start_date: '',
    due_date: '',
    current_situation: '',
    next_step: '',
    parent_task_id: defaults.parent_task_id || '',
    ...defaults,
  });
  const [saving, setSaving] = useState(false);

  const sortedStatuses = [...taskStatuses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error('请输入任务标题'); return; }
    setSaving(true);
    const assignee = users.find(u => u.id === form.assignee_id);
    const created = await base44.entities.Task.create({
      ...form,
      title: form.title.trim(),
      assignee_name: assignee?.full_name || '',
      created_by_id: currentUser?.id,
      created_by_name: currentUser?.full_name,
      is_archived: false,
    });
    await base44.entities.TaskActivity.create({
      task_id: created.id,
      author_id: currentUser?.id,
      author_name: currentUser?.full_name,
      entry_type: 'system',
      content: '任务已创建',
    });
    setSaving(false);
    toast.success('任务已创建');
    onCreated(created.id);
  };

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{form.parent_task_id ? '新建子任务' : '新建任务'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">标题 *</label>
            <Input
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="任务标题..."
              className="border-thin text-[13px]"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">状态</label>
              <Select value={form.status} onValueChange={v => setField('status', v)}>
                <SelectTrigger className="h-8 text-[12px] border-thin"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sortedStatuses.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">优先级</label>
              <Select value={form.priority} onValueChange={v => setField('priority', v)}>
                <SelectTrigger className="h-8 text-[12px] border-thin"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['普通', '重要', '紧急', '关键'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">分类</label>
              <Select value={form.category} onValueChange={v => setField('category', v)}>
                <SelectTrigger className="h-8 text-[12px] border-thin"><SelectValue placeholder="选择分类" /></SelectTrigger>
                <SelectContent>
                  {taskCategories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">模块</label>
              <Select value={form.module} onValueChange={v => setField('module', v)}>
                <SelectTrigger className="h-8 text-[12px] border-thin"><SelectValue placeholder="选择模块" /></SelectTrigger>
                <SelectContent>
                  {taskModules.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">负责人</label>
              <Select value={form.assignee_id} onValueChange={v => setField('assignee_id', v)}>
                <SelectTrigger className="h-8 text-[12px] border-thin"><SelectValue placeholder="未指定" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>未指定</SelectItem>
                  {users.filter(u => u.role === 'admin' || u.role === 'staff').map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">工作类型</label>
              <Select value={form.responsible_type} onValueChange={v => setField('responsible_type', v)}>
                <SelectTrigger className="h-8 text-[12px] border-thin"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="我方">我方</SelectItem>
                  <SelectItem value="外协">外协</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">开始日期</label>
              <Input type="date" value={form.start_date} onChange={e => setField('start_date', e.target.value)} className="h-8 text-[12px] border-thin" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">截止日期</label>
              <Input type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} className="h-8 text-[12px] border-thin" />
            </div>
          </div>
          {form.parent_task_id && (
            <div className="text-[11px] text-muted-foreground bg-muted/30 px-3 py-2 rounded-lg">
              子任务 → {allTasks.find(t => t.id === form.parent_task_id)?.title || '父任务'}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="h-8 text-[12px]">取消</Button>
          <Button onClick={handleCreate} disabled={saving} className="h-8 text-[12px]">
            {saving ? '创建中...' : '创建任务'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}