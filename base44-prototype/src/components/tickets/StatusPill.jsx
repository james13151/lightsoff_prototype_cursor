import React from 'react';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  '待处理':     { background: 'rgba(212,175,55,0.18)',  color: '#e8c84a', border: 'rgba(212,175,55,0.30)' },
  '处理中':     { background: 'rgba(80,140,220,0.18)',  color: '#7ab4f5', border: 'rgba(80,140,220,0.30)' },
  '待客户回复': { background: 'rgba(200,100,140,0.18)', color: '#e89abf', border: 'rgba(200,100,140,0.30)' },
  '已解决':     { background: 'rgba(80,180,120,0.18)',  color: '#6fd4a0', border: 'rgba(80,180,120,0.30)' },
  '待出库':     { background: 'rgba(80,140,220,0.18)',  color: '#7ab4f5', border: 'rgba(80,140,220,0.30)' },
  '出库中':     { background: 'rgba(200,140,60,0.18)',  color: '#f0b86a', border: 'rgba(200,140,60,0.30)' },
  '待发货':     { background: 'rgba(150,100,220,0.18)', color: '#c09af0', border: 'rgba(150,100,220,0.30)' },
  '已发货':     { background: 'rgba(80,180,120,0.18)',  color: '#6fd4a0', border: 'rgba(80,180,120,0.30)' },
};

export default function StatusPill({ status, size = 'sm' }) {
  const style = STATUS_STYLES[status] || { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: 'rgba(255,255,255,0.12)' };
  return (
    <span
      style={{ background: style.background, color: style.color, borderColor: style.border }}
      className={cn(
        'inline-flex items-center rounded-md border font-medium',
        size === 'sm' ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
      )}
    >
      {status}
    </span>
  );
}