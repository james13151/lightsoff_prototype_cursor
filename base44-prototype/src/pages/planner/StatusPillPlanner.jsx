import React from 'react';

export default function StatusPillPlanner({ status, statusInfo }) {
  const color = statusInfo?.color || '#9E9E9E';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
      style={{ background: `${color}20`, color }}
    >
      {status || '未设置'}
    </span>
  );
}