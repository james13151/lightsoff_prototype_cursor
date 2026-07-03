import React from 'react';
import { Mail, MessageCircle, Smartphone, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONFIG = {
  email: { label: 'Email', icon: Mail, tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  facebook: { label: 'Facebook', icon: MessageCircle, tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  instagram: { label: 'Instagram', icon: Sparkles, tone: 'bg-pink-50 text-pink-700 border-pink-200' },
  whatsapp: { label: 'WhatsApp', icon: Smartphone, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export default function ChannelBadge({ channel, className = '' }) {
  if (!channel) return null;
  const config = CONFIG[channel] || { label: channel, icon: MessageCircle, tone: 'bg-slate-100 text-slate-700 border-slate-200' };
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold', config.tone, className)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}
