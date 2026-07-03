import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { Lock, AlertCircle } from 'lucide-react';
import PriorityDot from './PriorityDot';
import UserAvatar from './UserAvatar';
import { format, parseISO, isPast } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export default function PlannerKanbanView({
  tasks, allTasks, taskStatuses, taskCategories, taskModules,
  users, currentUser, selectedTaskId, onSelectTask,
  getTaskProgress, isBlocked, completionStatusNames,
}) {
  const queryClient = useQueryClient();

  const onDragEnd = async (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    const task = tasks.find(t => t.id === draggableId);
    if (!task || task.status === newStatus) return;

    // Check if trying to move a blocked task to an in-progress-like status
    const destStatus = taskStatuses.find(s => s.name === newStatus);
    if (isBlocked(task) && newStatus !== '待办' && newStatus !== '已暂停') {
      toast.error('此任务存在未完成的依赖，无法移动到该状态', { description: '请先完成依赖任务' });
      return;
    }

    await base44.entities.Task.update(draggableId, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const topLevelTasks = tasks.filter(t => !t.parent_task_id);
  const childTasks = tasks.filter(t => !!t.parent_task_id);

  const sortedStatuses = [...taskStatuses].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 p-4 overflow-x-auto h-full items-start" style={{ minHeight: 0 }}>
        {sortedStatuses.map(status => {
          const colTasks = topLevelTasks.filter(t => t.status === status.name);
          return (
            <div key={status.id} className="flex-shrink-0 w-[260px] flex flex-col" style={{ maxHeight: '100%' }}>
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg" style={{ background: `${status.color}18` }}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: status.color }} />
                <span className="text-[12px] font-semibold text-foreground flex-1">{status.name}</span>
                <span className="text-[11px] text-muted-foreground">{colTasks.length}</span>
              </div>

              <Droppable droppableId={status.name}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'flex-1 overflow-y-auto custom-scrollbar rounded-xl p-2 space-y-2 min-h-[80px] transition-colors',
                      snapshot.isDraggingOver ? 'bg-primary/5' : 'bg-muted/20'
                    )}
                    style={{ maxHeight: 'calc(100vh - 220px)' }}
                  >
                    {colTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                          >
                            <KanbanCard
                              task={task}
                              taskModules={taskModules}
                              users={users}
                              isSelected={selectedTaskId === task.id}
                              isDragging={snapshot.isDragging}
                              onClick={() => onSelectTask(task.id)}
                              getTaskProgress={getTaskProgress}
                              isBlocked={isBlocked}
                              completionStatusNames={completionStatusNames}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}

function KanbanCard({ task, taskModules, users, isSelected, isDragging, onClick, getTaskProgress, isBlocked, completionStatusNames }) {
  const progress = getTaskProgress(task.id);
  const blocked = isBlocked(task);
  const assignee = users.find(u => u.id === task.assignee_id);
  const moduleInfo = taskModules.find(m => m.name === task.module);
  const isOverdue = task.due_date && isPast(parseISO(task.due_date)) && !completionStatusNames.has(task.status);

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl p-3 cursor-pointer shadow-sm border transition-all hover:shadow-md',
        isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/50',
        isDragging ? 'shadow-lg rotate-1' : '',
        blocked ? 'border-amber-300/60' : ''
      )}
    >
      {/* Title row */}
      <div className="flex items-start gap-1.5 mb-2">
        {blocked && <Lock className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" title="被依赖阻塞" />}
        <span className="text-[12px] font-medium text-foreground leading-snug flex-1">{task.title}</span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {task.module && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{ background: `${moduleInfo?.color || '#4A5B7A'}20`, color: moduleInfo?.color || '#4A5B7A' }}
          >
            {task.module}
          </span>
        )}
        <PriorityDot priority={task.priority} />
        {isOverdue && <AlertCircle className="w-3 h-3 text-red-500" title="已超期" />}
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-muted-foreground">子任务 {progress.done}/{progress.total}</span>
            <span className="text-[10px] text-muted-foreground">{progress.pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-1.5">
        {assignee ? (
          <div className="flex items-center gap-1">
            <UserAvatar user={assignee} size={18} />
            <span className="text-[10px] text-muted-foreground">{assignee.full_name?.split(' ')[0]}</span>
          </div>
        ) : <span />}

        {task.due_date && (
          <span className={cn('text-[10px]', isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
            {format(parseISO(task.due_date), 'MM/dd')}
          </span>
        )}
      </div>
    </div>
  );
}