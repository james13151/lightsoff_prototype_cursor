import React from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function PlannerFilters({ filters, onChange, taskCategories, taskStatuses, taskModules, users, onClose }) {
  const set = (key, value) => onChange(f => ({ ...f, [key]: value }));
  const toggleMulti = (key, value) => {
    const arr = filters[key] || [];
    set(key, arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]);
  };
  const clearAll = () => onChange({
    categories: [], statuses: [], modules: [], assignees: [],
    responsible_type: '', priorities: [], due_date_from: '', due_date_to: '',
    has_dependencies: '', has_children: '', quick: '',
  });

  return (
    <div className="mt-3 p-3 rounded-xl border border-border/50 bg-muted/10 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-medium text-foreground">高级筛选</span>
        <div className="flex gap-2">
          <button onClick={clearAll} className="text-[11px] text-muted-foreground hover:text-foreground">清除全部</button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Categories */}
        <FilterGroup label="分类">
          {taskCategories.map(c => (
            <Chip key={c.id} label={c.name} active={filters.categories.includes(c.name)} color={c.color}
              onClick={() => toggleMulti('categories', c.name)} />
          ))}
        </FilterGroup>

        {/* Statuses */}
        <FilterGroup label="状态">
          {taskStatuses.map(s => (
            <Chip key={s.id} label={s.name} active={filters.statuses.includes(s.name)} color={s.color}
              onClick={() => toggleMulti('statuses', s.name)} />
          ))}
        </FilterGroup>

        {/* Modules */}
        <FilterGroup label="模块">
          {taskModules.map(m => (
            <Chip key={m.id} label={m.name} active={filters.modules.includes(m.name)} color={m.color}
              onClick={() => toggleMulti('modules', m.name)} />
          ))}
        </FilterGroup>

        {/* Priorities */}
        <FilterGroup label="优先级">
          {['普通', '重要', '紧急', '关键'].map(p => (
            <Chip key={p} label={p} active={filters.priorities.includes(p)}
              onClick={() => toggleMulti('priorities', p)} />
          ))}
        </FilterGroup>

        {/* Assignees */}
        <FilterGroup label="负责人">
          {users.filter(u => u.role === 'admin' || u.role === 'staff').map(u => (
            <Chip key={u.id} label={u.full_name} active={filters.assignees.includes(u.id)}
              onClick={() => toggleMulti('assignees', u.id)} />
          ))}
        </FilterGroup>

        {/* Responsible type */}
        <FilterGroup label="工作类型">
          {['我方', '外协'].map(t => (
            <Chip key={t} label={t} active={filters.responsible_type === t}
              onClick={() => set('responsible_type', filters.responsible_type === t ? '' : t)} />
          ))}
        </FilterGroup>

        {/* Has dependencies */}
        <FilterGroup label="依赖">
          <Chip label="有依赖" active={filters.has_dependencies === 'yes'} onClick={() => set('has_dependencies', filters.has_dependencies === 'yes' ? '' : 'yes')} />
          <Chip label="无依赖" active={filters.has_dependencies === 'no'} onClick={() => set('has_dependencies', filters.has_dependencies === 'no' ? '' : 'no')} />
        </FilterGroup>

        {/* Has children */}
        <FilterGroup label="子任务">
          <Chip label="有子任务" active={filters.has_children === 'yes'} onClick={() => set('has_children', filters.has_children === 'yes' ? '' : 'yes')} />
          <Chip label="无子任务" active={filters.has_children === 'no'} onClick={() => set('has_children', filters.has_children === 'no' ? '' : 'no')} />
        </FilterGroup>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">截止日期：</span>
        <Input type="date" value={filters.due_date_from} onChange={e => set('due_date_from', e.target.value)} className="h-7 text-[12px] border-thin w-36" />
        <span className="text-[11px] text-muted-foreground">至</span>
        <Input type="date" value={filters.due_date_to} onChange={e => set('due_date_to', e.target.value)} className="h-7 text-[12px] border-thin w-36" />
      </div>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors',
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 text-muted-foreground hover:bg-muted'
      )}
      style={active && color ? { borderColor: color, background: `${color}18`, color } : {}}
    >
      {label}
    </button>
  );
}