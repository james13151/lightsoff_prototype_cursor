import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { isAdmin } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, Plus, Lock, MoreHorizontal, Trash2 } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import PriorityDot from './components/PriorityDot';
import AssigneeAvatar from './components/AssigneeAvatar';
import ProgressBar from './components/ProgressBar';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const PRIORITY_ORDER = { '关键': 0, '紧急': 1, '重要': 2, '普通': 3 };

export default function PlannerTableView({
  tasks, allTasks, taskStatuses, taskCategories, taskModules, users,
  currentUser, selectedTaskId, onSelectTask, onCreateTask, getTaskProgress, isBlocked, completionStatusNames
}) {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedParents, setExpandedParents] = useState({});
  const queryClient = useQueryClient();

  // Group top-level tasks by category
  const topLevelTasks = useMemo(() => tasks.filter(t => !t.parent_task_id), [tasks]);
  const childTasksMap = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      if (t.parent_task_id) {
        if (!map[t.parent_task_id]) map[t.parent_task_id] = [];
        map[t.parent_task_id].push(t);
      }
    });
    return map;
  }, [tasks]);

  const grouped = useMemo(() => {
    const groups = {};
    topLevelTasks.forEach(task => {
      const cat = task.category || '未分类';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(task);
    });
    return groups;
  }, [topLevelTasks]);

  const toggleCategory = (cat) => {
    setExpandedCategories(p => ({ ...p, [cat]: !p[cat] }));
  };

  const toggleParent = (id) => {
    setExpandedParents(p => ({ ...p, [id]: !p[id] }));
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`确认删除任务「${task.title}」？`)) return;
    await base44.entities.Task.update(task.id, { is_archived: true });
    toast.success('任务已删除');
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const canEdit = (task) => {
    if (isAdmin(currentUser)) return true;
    return task.assignee_id === currentUser?.id || task.created_by_id === currentUser?.id;
  };

  const getCategoryColor = (catName) => {
    const cat = taskCategories.find(c => c.name === catName);
    return cat?.color || '#9E9E9E';
  };

  const categoryOrder = taskCategories.map(c => c.name);
  const sortedCategories = [
    ...categoryOrder.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !categoryOrder.includes(c)),
  ];

  return (
    <div className="min-w-[900px]">
      {/* Header row */}
      <div className="flex items-center px-4 py-2 border-b border-border/50 bg-muted/30 sticky top-0 z-10">
        <div className="w-6 flex-shrink-0" />
        <div className="flex-1 min-w-[240px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider">标题</div>
        <div className="w-[100px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:block">分类</div>
        <div className="w-[90px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden xl:block">模块</div>
        <div className="w-[110px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider">状态</div>
        <div className="w-[90px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:block">负责人</div>
        <div className="w-[60px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden xl:block">优先级</div>
        <div className="w-[90px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:block">截止日期</div>
        <div className="w-[120px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden xl:block">当前情况</div>
        <div className="w-[90px] text-[11px] font-medium text-muted-foreground uppercase tracking-wider hidden xl:block">工作类型</div>
        <div className="w-8 flex-shrink-0" />
      </div>

      {sortedCategories.map(cat => {
        const catTasks = grouped[cat] || [];
        const isCatCollapsed = expandedCategories[cat] === true;
        const catColor = getCategoryColor(cat);

        return (
          <div key={cat}>
            {/* Category header */}
            <div
              className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-muted/20 group border-b border-border/30"
              onClick={() => toggleCategory(cat)}
            >
              {isCatCollapsed
                ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: catColor }} />
              <span className="text-[13px] font-semibold text-foreground">{cat}</span>
              <span className="text-[11px] text-muted-foreground">({catTasks.length})</span>
              <button
                onClick={e => { e.stopPropagation(); onCreateTask({ category: cat }); }}
                className="opacity-0 group-hover:opacity-100 ml-auto text-muted-foreground hover:text-primary transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {!isCatCollapsed && catTasks.map(task => (
              <TaskRow
                key={task.id}
                task={task}
                indent={0}
                childTasks={childTasksMap[task.id] || []}
                childTasksMap={childTasksMap}
                expanded={expandedParents[task.id]}
                onToggle={() => toggleParent(task.id)}
                taskStatuses={taskStatuses}
                users={users}
                selectedTaskId={selectedTaskId}
                onSelectTask={onSelectTask}
                onCreateTask={onCreateTask}
                onDelete={handleDelete}
                canEdit={canEdit}
                getTaskProgress={getTaskProgress}
                isBlocked={isBlocked}
                completionStatusNames={completionStatusNames}
              />
            ))}

            {!isCatCollapsed && (
              <div
                className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-primary hover:bg-muted/10 cursor-pointer transition-colors"
                onClick={() => onCreateTask({ category: cat })}
              >
                <div className="w-6 flex-shrink-0" />
                <Plus className="w-3.5 h-3.5" />
                <span className="text-[12px]">添加任务</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Add new category */}
      <div
        className="flex items-center gap-2 px-4 py-3 text-muted-foreground hover:text-primary hover:bg-muted/10 cursor-pointer transition-colors border-t border-border/30"
        onClick={() => onCreateTask({})}
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="text-[12px]">新建任务</span>
      </div>
    </div>
  );
}

function TaskRow({ task, indent, childTasks, childTasksMap, expanded, onToggle, taskStatuses, users, selectedTaskId, onSelectTask, onCreateTask, onDelete, canEdit, getTaskProgress, isBlocked, completionStatusNames }) {
  const hasChildren = childTasks.length > 0;
  const progress = getTaskProgress(task.id);
  const blocked = isBlocked(task);
  const isSelected = selectedTaskId === task.id;
  const isOverdue = task.due_date && isPast(parseISO(task.due_date + 'T23:59:59')) && !completionStatusNames.has(task.status);

  const assignee = users.find(u => u.id === task.assignee_id);

  return (
    <>
      <div
        className={cn(
          'flex items-center px-4 py-[7px] border-b border-border/20 hover:bg-muted/20 cursor-pointer transition-colors group',
          isSelected && 'bg-primary/5 border-l-2 border-l-primary',
          blocked && 'opacity-75'
        )}
        onClick={() => onSelectTask(task.id)}
        style={{ paddingLeft: `${16 + indent * 20}px` }}
      >
        {/* Expand toggle */}
        <div className="w-6 flex-shrink-0 flex items-center justify-center">
          {hasChildren ? (
            <button onClick={e => { e.stopPropagation(); onToggle(); }} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : indent > 0 ? (
            <span className="w-3.5 h-3.5 block border-l border-b border-border/40 -ml-1 mb-1 rounded-bl" />
          ) : null}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {blocked && <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />}
          <span className={cn('text-[13px] truncate', completionStatusNames.has(task.status) && 'line-through text-muted-foreground')}>
            {task.title}
          </span>
          {hasChildren && progress && (
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {progress.done}/{progress.total}
            </span>
          )}
          {hasChildren && progress && (
            <div className="w-16 hidden xl:block">
              <ProgressBar pct={progress.pct} />
            </div>
          )}
        </div>

        {/* Category */}
        <div className="w-[100px] hidden lg:block">
          {task.category && <span className="text-[12px] text-muted-foreground truncate">{task.category}</span>}
        </div>

        {/* Module */}
        <div className="w-[90px] hidden xl:block">
          {task.module && <span className="text-[12px] text-muted-foreground truncate">{task.module}</span>}
        </div>

        {/* Status */}
        <div className="w-[110px]">
          <TaskStatusPillInline status={task.status} taskStatuses={taskStatuses} />
        </div>

        {/* Assignee */}
        <div className="w-[90px] hidden lg:block">
          {assignee && <AssigneeAvatar user={assignee} size="sm" />}
        </div>

        {/* Priority */}
        <div className="w-[60px] hidden xl:block">
          <PriorityDot priority={task.priority} showLabel />
        </div>

        {/* Due date */}
        <div className="w-[90px] hidden lg:block">
          {task.due_date && (
            <span className={cn('text-[12px]', isOverdue ? 'text-red-500' : 'text-muted-foreground')}>
              {format(parseISO(task.due_date), 'MM/dd')}
            </span>
          )}
        </div>

        {/* Current situation */}
        <div className="w-[120px] hidden xl:block">
          <span className="text-[12px] text-muted-foreground truncate block">{task.current_situation || ''}</span>
        </div>

        {/* Responsible type */}
        <div className="w-[90px] hidden xl:block">
          {task.responsible_type && (
            <span className={cn(
              'text-[11px] px-1.5 py-0.5 rounded',
              task.responsible_type === '外协' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            )}>
              {task.responsible_type}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="w-8 flex-shrink-0 flex items-center justify-end opacity-0 group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button onClick={e => e.stopPropagation()} className="p-1 rounded hover:bg-muted text-muted-foreground">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-[12px]">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onCreateTask({ parent_task_id: task.id, category: task.category }); }}>
                <Plus className="w-3.5 h-3.5 mr-2" />添加子任务
              </DropdownMenuItem>
              {canEdit(task) && (
                <DropdownMenuItem className="text-destructive" onClick={e => { e.stopPropagation(); onDelete(task); }}>
                  <Trash2 className="w-3.5 h-3.5 mr-2" />删除
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Children */}
      {expanded && childTasks.map(child => (
        <TaskRow
          key={child.id}
          task={child}
          indent={indent + 1}
          childTasks={childTasksMap[child.id] || []}
          childTasksMap={childTasksMap}
          expanded={false}
          onToggle={() => {}}
          taskStatuses={taskStatuses}
          users={users}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          onCreateTask={onCreateTask}
          onDelete={onDelete}
          canEdit={canEdit}
          getTaskProgress={getTaskProgress}
          isBlocked={isBlocked}
          completionStatusNames={completionStatusNames}
        />
      ))}
    </>
  );
}

function TaskStatusPillInline({ status, taskStatuses }) {
  const s = taskStatuses.find(ts => ts.name === status);
  const color = s?.color || '#9E9E9E';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: color + '22', color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {status || '—'}
    </span>
  );
}