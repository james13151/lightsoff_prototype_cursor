import React from 'react';

const PRIORITY_CONFIG = {
  '普通': { color: '#9E9E9E', label: '普通' },
  '重要': { color: '#4FC3F7', label: '重要' },
  '紧急': { color: '#FFB74D', label: '紧急' },
  '关键': { color: '#E57373', label: '关键' },
};

export default function PriorityDot({ priority, showLabel }) {
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG['普通'];
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
      {showLabel && <span className="text-[11px]" style={{ color: cfg.color }}>{cfg.label}</span>}
    </span>
  );
}