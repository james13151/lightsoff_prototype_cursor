export default function TaskStatusPill({ status, taskStatuses, size = 'sm' }) {
  const s = taskStatuses.find(ts => ts.name === status);
  const color = s?.color || '#9E9E9E';
  const sizeClass = size === 'sm' ? 'text-[11px] px-2 py-0.5' : 'text-[12px] px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClass}`} style={{ background: color + '22', color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {status || '—'}
    </span>
  );
}