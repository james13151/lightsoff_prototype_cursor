import React from 'react';
import { useI18n } from '@/lib/i18nContext';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LocaleToggle({ className }) {
  const { locale, switchLocale } = useI18n();
  return (
    <button
      onClick={() => switchLocale(locale === 'zh' ? 'en' : 'zh')}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors',
        className
      )}
      title={locale === 'zh' ? 'Switch to English' : '切换中文'}
    >
      <Globe className="w-3.5 h-3.5" />
      <span>{locale === 'zh' ? '中' : 'EN'}</span>
    </button>
  );
}