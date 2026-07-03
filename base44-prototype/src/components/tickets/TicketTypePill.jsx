import React from 'react';

const TYPE_STYLES = {
  '投诉':   { bg: 'rgba(239,68,68,0.12)', color: '#f87171' },
  '退货':   { bg: 'rgba(251,146,60,0.12)', color: '#fb923c' },
  '物流异常': { bg: 'rgba(168,85,247,0.12)', color: '#c084fc' },
  '咨询':   { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa' },
};

export default function TicketTypePill({ type, size = 'sm' }) {
  if (!type) return null;
  const style = TYPE_STYLES[type] || { bg: 'rgba(255,255,255,0.08)', color: '#aaa' };
  const px = size === 'md' ? '8px' : '6px';
  const py = size === 'md' ? '3px' : '2px';
  const fs = size === 'md' ? '11px' : '10px';
  return (
    <span style={{ background: style.bg, color: style.color, padding: `${py} ${px}`, borderRadius: 6, fontSize: fs, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {type}
    </span>
  );
}