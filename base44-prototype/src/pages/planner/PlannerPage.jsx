import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { isAdmin, isStaff } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Plus, LayoutList, Kanban, Filter, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import PlannerTableView from './PlannerTableView';
import PlannerKanbanView from './PlannerKanbanView';
import TaskDetailPanel from './TaskDetailPanel';
import CreateTaskDialog from './CreateTaskDialog';
import PlannerFilters from './PlannerFilters';
import { cn } from '@/lib/utils';
import { startOfWeek, endOfWeek, parseISO } from 'date-fns';

export default function PlannerPage({ currentUser }) {
  const [view, setView] = useState('table');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    categories: [],
    statuses: [],
    modules: [],
    assignees: [],
    responsible_type: '',
    priorities: [],
    due_date_from: '',
    due_date_to: '',
    has_dependencies: '',
    has_children: '',
    quick: '',
  });
  const queryClient = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.filter({ is_archived: false }, '-created_date', 500),
    refetchInterval: 20000,
  });

  const { data: taskStatuses = [] } = useQuery({
    queryKey: ['task_statuses'],
    queryFn: () => base44.entities.TaskStatus.list('order', 50),
  });

  const { data: taskCategories = [] } = useQuery({
    queryKey: ['task_categories'],
    queryFn: () => base44.entities.TaskCategory.list('order', 50),
  });

  const { data: taskModules = [] } = useQuery({
    queryKey: ['task_modules'],
    queryFn: () => base44.entities.TaskModule.list('order', 50),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const completionStatusNames = useMemo(
    () => new Set(taskStatuses.filter(s => s.is_completion_status).map(s => s.name)),
    [taskStatuses]
  );

  // Build child map for progress calculation
  const childMap = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      if (t.parent_task_id) {
        if (!map[t.parent_task_id]) map[t.parent_task_id] = [];
        map[t.parent_task_id].push(t);
      }
    });
    return map;
  }, [tasks]);

  const getTaskProgress = (taskId) => {
    const children = childMap[taskId] || [];
    if (children.length === 0) return null;
    const done = children.filter(c => completionStatusNames.has(c.status)).length;
    return { done, total: children.length, pct: Math.round((done / children.length) * 100) };
  };

  const isBlocked = (task) => {
    if (!task.dependencies?.length) return false;
    return task.dependencies.some(depId => {
      const dep = tasks.find(t => t.id === depId);
      return dep && !completionStatusNames.has(dep.status);
    });
  };

  // Apply filters + search
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Quick filter
      if (filters.quick === 'mine' && task.assignee_id !== currentUser?.id) return false;
      if (filters.quick === 'outsource' && task.responsible_type !== '外协') return false;
      if (filters.quick === 'blocked' && !isBlocked(task)) return false;
      if (filters.quick === 'due_this_week') {
        if (!task.due_date) return false;
        const d = parseISO(task.due_date);
        if (d < weekStart || d > weekEnd) return false;
      }

      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = (task.title || '').toLowerCase().includes(q) ||
          (task.module || '').toLowerCase().includes(q) ||
          (task.current_situation || '').toLowerCase().includes(q) ||
          (task.next_step || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      if (filters.categories.length && !filters.categories.includes(task.category)) return false;
      if (filters.statuses.length && !filters.statuses.includes(task.status)) return false;
      if (filters.modules.length && !filters.modules.includes(task.module)) return false;
      if (filters.assignees.length && !filters.assignees.includes(task.assignee_id)) return false;
      if (filters.responsible_type && task.responsible_type !== filters.responsible_type) return false;
      if (filters.priorities.length && !filters.priorities.includes(task.priority)) return false;
      if (filters.due_date_from && task.due_date && task.due_date < filters.due_date_from) return false;
      if (filters.due_date_to && task.due_date && task.due_date > filters.due_date_to) return false;
      if (filters.has_dependencies === 'yes' && !task.dependencies?.length) return false;
      if (filters.has_dependencies === 'no' && task.dependencies?.length) return false;
      if (filters.has_children === 'yes' && !(childMap[task.id]?.length)) return false;
      if (filters.has_children === 'no' && childMap[task.id]?.length) return false;

      return true;
    });
  }, [tasks, filters, searchQuery, currentUser, childMap, completionStatusNames]);

  const activeFilterCount = [
    filters.categories.length,
    filters.statuses.length,
    filters.modules.length,
    filters.assignees.length,
    filters.responsible_type ? 1 : 0,
    filters.priorities.length,
    filters.due_date_from ? 1 : 0,
    filters.due_date_to ? 1 : 0,
    filters.has_dependencies ? 1 : 0,
    filters.has_children ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const handleCreateTask = (defaults = {}) => {
    setShowCreateDialog({ defaults });
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-border/50" style={{ background: '#fff' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-[17px] font-semibold text-foreground">项目计划</h1>
              <p className="text-[12px] text-muted-foreground mt-0.5">{filteredTasks.filter(t => !t.parent_task_id).length} 个任务</p>
            </div>
            <div className="flex items-center gap-2">
              {(isAdmin(currentUser) || isStaff(currentUser)) && (
                <Button size="sm" onClick={() => handleCreateTask()} className="h-8 text-[12px] gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  新建任务
                </Button>
              )}
            </div>
          </div>

          {/* Quick filters + view toggle + search */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick filters */}
            <div className="flex items-center gap-1 mr-2">
              {[
                { key: '', label: '全部' },
                { key: 'mine', label: '我负责的' },
                { key: 'outsource', label: '外协跟进' },
                { key: 'blocked', label: '被阻塞的' },
                { key: 'due_this_week', label: '本周到期' },
              ].map(qf => (
                <button
                  key={qf.key}
                  onClick={() => setFilters(f => ({ ...f, quick: qf.key }))}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors',
                    filters.quick === qf.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {qf.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-w-0 relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索任务..."
                className="h-8 pl-8 text-[12px] rounded-lg border-thin"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'h-8 px-3 rounded-lg text-[12px] flex items-center gap-1.5 border border-thin transition-colors',
                activeFilterCount > 0 ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              筛选
              {activeFilterCount > 0 && <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{activeFilterCount}</span>}
            </button>

            {/* View toggle */}
            <div className="flex rounded-lg overflow-hidden border border-thin border-border">
              <button
                onClick={() => setView('table')}
                className={cn('h-8 px-3 text-[12px] flex items-center gap-1.5 transition-colors', view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
              >
                <LayoutList className="w-3.5 h-3.5" />
                表格
              </button>
              <button
                onClick={() => setView('kanban')}
                className={cn('h-8 px-3 text-[12px] flex items-center gap-1.5 transition-colors', view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
              >
                <Kanban className="w-3.5 h-3.5" />
                看板
              </button>
            </div>
          </div>

          {/* Advanced filters panel */}
          {showFilters && (
            <PlannerFilters
              filters={filters}
              onChange={setFilters}
              taskCategories={taskCategories}
              taskStatuses={taskStatuses}
              taskModules={taskModules}
              users={users}
              onClose={() => setShowFilters(false)}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          <div className="flex-1 overflow-auto custom-scrollbar">
            {view === 'table' ? (
              <PlannerTableView
                tasks={filteredTasks}
                allTasks={tasks}
                taskStatuses={taskStatuses}
                taskCategories={taskCategories}
                taskModules={taskModules}
                users={users}
                currentUser={currentUser}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onCreateTask={handleCreateTask}
                getTaskProgress={getTaskProgress}
                isBlocked={isBlocked}
                completionStatusNames={completionStatusNames}
              />
            ) : (
              <PlannerKanbanView
                tasks={filteredTasks}
                allTasks={tasks}
                taskStatuses={taskStatuses}
                taskCategories={taskCategories}
                taskModules={taskModules}
                users={users}
                currentUser={currentUser}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                getTaskProgress={getTaskProgress}
                isBlocked={isBlocked}
                completionStatusNames={completionStatusNames}
              />
            )}
          </div>

          {/* Task detail panel */}
          {selectedTaskId && (
            <TaskDetailPanel
              taskId={selectedTaskId}
              allTasks={tasks}
              taskStatuses={taskStatuses}
              taskCategories={taskCategories}
              taskModules={taskModules}
              users={users}
              currentUser={currentUser}
              onClose={() => setSelectedTaskId(null)}
              onTaskUpdated={() => queryClient.invalidateQueries({ queryKey: ['tasks'] })}
              isBlocked={isBlocked}
              completionStatusNames={completionStatusNames}
              getTaskProgress={getTaskProgress}
            />
          )}
        </div>
      </div>

      {/* Create task dialog */}
      {showCreateDialog && (
        <CreateTaskDialog
          open={true}
          defaults={showCreateDialog.defaults || {}}
          taskStatuses={taskStatuses}
          taskCategories={taskCategories}
          taskModules={taskModules}
          users={users}
          currentUser={currentUser}
          allTasks={tasks}
          onClose={() => setShowCreateDialog(false)}
          onCreated={(id) => {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            setShowCreateDialog(false);
            setSelectedTaskId(id);
          }}
        />
      )}
    </div>
  );
}