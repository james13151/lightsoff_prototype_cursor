import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function PlannerSettings() {
  return (
    <div>
      <h3 className="text-[14px] font-semibold text-foreground mb-1">项目计划设置</h3>
      <p className="text-[11px] text-muted-foreground mb-4">管理任务状态、分类、模块</p>
      <Tabs defaultValue="statuses">
        <TabsList className="mb-4 bg-muted/30 border border-thin border-border">
          <TabsTrigger value="statuses" className="text-[12px]">状态管理</TabsTrigger>
          <TabsTrigger value="categories" className="text-[12px]">分类管理</TabsTrigger>
          <TabsTrigger value="modules" className="text-[12px]">模块管理</TabsTrigger>
        </TabsList>
        <TabsContent value="statuses"><StatusManager /></TabsContent>
        <TabsContent value="categories"><SimpleListManager entity="TaskCategory" label="分类" /></TabsContent>
        <TabsContent value="modules"><SimpleListManager entity="TaskModule" label="模块" /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatusManager() {
  const queryClient = useQueryClient();
  const { data: statuses = [] } = useQuery({
    queryKey: ['task_statuses'],
    queryFn: () => base44.entities.TaskStatus.list('order', 50),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 500),
  });

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#9E9E9E');

  const sorted = [...statuses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const usedStatuses = new Set(tasks.map(t => t.status));

  const addStatus = async () => {
    if (!newName.trim()) return;
    await base44.entities.TaskStatus.create({ name: newName.trim(), color: newColor, order: sorted.length, is_completion_status: false });
    queryClient.invalidateQueries({ queryKey: ['task_statuses'] });
    setNewName('');
    setNewColor('#9E9E9E');
    toast.success('状态已添加');
  };

  const deleteStatus = async (status) => {
    if (usedStatuses.has(status.name)) {
      toast.error(`状态「${status.name}」正在使用中，无法删除`);
      return;
    }
    await base44.entities.TaskStatus.delete(status.id);
    queryClient.invalidateQueries({ queryKey: ['task_statuses'] });
    toast.success('状态已删除');
  };

  const updateStatus = async (id, field, value) => {
    await base44.entities.TaskStatus.update(id, { [field]: value });
    queryClient.invalidateQueries({ queryKey: ['task_statuses'] });
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = Array.from(sorted);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    await Promise.all(reordered.map((s, i) => base44.entities.TaskStatus.update(s.id, { order: i })));
    queryClient.invalidateQueries({ queryKey: ['task_statuses'] });
  };

  return (
    <div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="statuses">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 mb-4">
              {sorted.map((status, index) => (
                <Draggable key={status.id} draggableId={status.id} index={index}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-white">
                      <span {...provided.dragHandleProps} className="text-muted-foreground cursor-grab">
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                      <input type="color" value={status.color || '#9E9E9E'} onChange={e => updateStatus(status.id, 'color', e.target.value)}
                        className="w-6 h-6 rounded border-0 cursor-pointer" />
                      <Input value={status.name} onChange={e => updateStatus(status.id, 'name', e.target.value)}
                        className="h-7 text-[12px] border-thin flex-1" />
                      <Select value={status.default_assignee_id || ''} onValueChange={v => updateStatus(status.id, 'default_assignee_id', v)}>
                        <SelectTrigger className="h-7 text-[11px] border-thin w-28"><SelectValue placeholder="默认负责人" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>无</SelectItem>
                          {users.filter(u => u.role === 'admin' || u.role === 'staff').map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                        <Switch checked={!!status.is_completion_status} onCheckedChange={v => updateStatus(status.id, 'is_completion_status', v)} />
                        完成
                      </label>
                      <button onClick={() => deleteStatus(status)} className={usedStatuses.has(status.name) ? 'text-muted-foreground/30 cursor-not-allowed' : 'text-muted-foreground hover:text-destructive'}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="flex items-center gap-2">
        <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer" />
        <Input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStatus()}
          placeholder="新状态名称..." className="h-8 text-[12px] border-thin flex-1" />
        <Button size="sm" onClick={addStatus} className="h-8 text-[12px]"><Plus className="w-3.5 h-3.5 mr-1" />添加</Button>
      </div>
    </div>
  );
}

function SimpleListManager({ entity, label }) {
  const queryClient = useQueryClient();
  const queryKey = [`task_${entity.toLowerCase()}s`];
  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: () => base44.entities[entity].list('order', 50),
  });

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#4A5B7A');
  const sorted = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const addItem = async () => {
    if (!newName.trim()) return;
    await base44.entities[entity].create({ name: newName.trim(), color: newColor, order: sorted.length });
    queryClient.invalidateQueries({ queryKey });
    setNewName('');
    setNewColor('#4A5B7A');
    toast.success(`${label}已添加`);
  };

  const deleteItem = async (item) => {
    await base44.entities[entity].delete(item.id);
    queryClient.invalidateQueries({ queryKey });
    toast.success(`${label}已删除`);
  };

  const updateItem = async (id, field, value) => {
    await base44.entities[entity].update(id, { [field]: value });
    queryClient.invalidateQueries({ queryKey });
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = Array.from(sorted);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    await Promise.all(reordered.map((item, i) => base44.entities[entity].update(item.id, { order: i })));
    queryClient.invalidateQueries({ queryKey });
  };

  return (
    <div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={entity}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 mb-4">
              {sorted.map((item, index) => (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-white">
                      <span {...provided.dragHandleProps} className="text-muted-foreground cursor-grab">
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                      <input type="color" value={item.color || '#4A5B7A'} onChange={e => updateItem(item.id, 'color', e.target.value)}
                        className="w-6 h-6 rounded border-0 cursor-pointer" />
                      <Input value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)}
                        className="h-7 text-[12px] border-thin flex-1" />
                      <button onClick={() => deleteItem(item)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="flex items-center gap-2">
        <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} className="w-6 h-6 rounded border-0 cursor-pointer" />
        <Input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder={`新${label}名称...`} className="h-8 text-[12px] border-thin flex-1" />
        <Button size="sm" onClick={addItem} className="h-8 text-[12px]"><Plus className="w-3.5 h-3.5 mr-1" />添加</Button>
      </div>
    </div>
  );
}