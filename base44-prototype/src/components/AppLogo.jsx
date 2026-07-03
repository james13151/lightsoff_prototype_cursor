import React from 'react';
import { useSettings } from '@/lib/settingsContext';

/**
 * variant:
 *   "login"   — large centered block (72px container + text + gold bar)
 *   "sidebar" — icon (36px) + text side by side
 *   "icon"    — icon only (36px)
 */
export default function AppLogo({ variant = 'sidebar' }) {
  const { settings } = useSettings();
  const logoUrl = settings?.logo_url;

  const LogoIcon = ({ size = 36, radius = 8 }) => (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: logoUrl ? 'transparent' : 'rgba(212,175,55,0.15)',
        border: '1px solid rgba(212,175,55,0.25)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <span style={{ color: '#D4AF37', fontSize: size * 0.28, fontWeight: 700, lineHeight: 1 }}>
          OMB
        </span>
      )}
    </div>
  );

  if (variant === 'login') {
    return (
      <div className="flex flex-col items-center mb-8">
        <LogoIcon size={72} radius={14} />
        <div className="mt-4 text-[22px] font-bold tracking-tight" style={{ color: '#D4AF37' }}>OMB PIT</div>
        <div className="text-[13px] text-muted-foreground mt-1">协同工作区</div>
        <div className="mt-3 rounded-full" style={{ width: 32, height: 2, background: '#D4AF37' }} />
      </div>
    );
  }

  if (variant === 'icon') {
    return <LogoIcon size={36} radius={8} />;
  }

  // sidebar — icon + text
  return (
    <div className="flex items-center gap-2.5">
      <LogoIcon size={36} radius={8} />
      <span className="text-[15px] font-bold tracking-wide" style={{ color: '#D4AF37' }}>OMB PIT</span>
    </div>
  );
}