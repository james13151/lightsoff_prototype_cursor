
const PRIORITY_CONFIG = {
  '关键': { color: '#D32F2F', label: '关键' },
  '紧急': { color: '#F57C00', label: '紧急' },
  '重要': { color: '#1976D2', label: '重要' },
  '普通': { color: '#9E9E9E', label: '普通' },
};

export default function PriorityDot({ priority, showLabel = false }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG['普通'];
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
      {showLabel && <span className="text-[11px]" style={{ color: cfg.color }}>{cfg.label}</span>}
    </span>
  );
}

export { PRIORITY_CONFIG };