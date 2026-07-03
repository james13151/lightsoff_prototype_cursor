import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/helpers';
import {
  LayoutList, AlertTriangle, User, Users, Bell, Settings, BookOpen,
  Package, PackagePlus, PackageMinus, AlertCircle, Sliders, ArrowLeftRight,
  ShoppingCart, Building2, CreditCard, ChevronDown, ChevronRight, LogOut,
  DollarSign, Globe, Wallet, BookMarked, Archive, ClipboardList,
  MessageSquareMore
} from 'lucide-react';
import { isAdmin, isSupplier, isStaff, isPartner, getRoleLabel } from '@/lib/permissions';
import { useI18n } from '@/lib/i18nContext';

export default function Sidebar({ activeNav, onNavChange, badges, currentUser }) {
  const { t, locale, switchLocale } = useI18n();
  const [collapsed, setCollapsed] = useState({ ticket: false, inventory: false, purchasing: false, memo: false, settlement: false, expenses: false, planner: false });
  const userIsAdmin = isAdmin(currentUser);
  const userIsSupplier = isSupplier(currentUser);
  const userIsPartner = isPartner(currentUser);
  const userIsStaff = isStaff(currentUser);

  const toggle = (section) => setCollapsed(c => ({ ...c, [section]: !c[section] }));

  if (userIsSupplier) {
    return <SupplierSidebar activeNav={activeNav} onNavChange={onNavChange} badges={badges} currentUser={currentUser} />;
  }
  if (userIsPartner) {
    return <PartnerSidebar activeNav={activeNav} onNavChange={onNavChange} badges={badges} currentUser={currentUser} />;
  }

  const TICKET_ITEMS = [
    { key: 'all', label: t('nav_all_tickets'), icon: LayoutList, badgeKey: 'totalOpen' },
    { key: 'urgent', label: t('nav_urgent'), icon: AlertTriangle, badgeKey: 'urgent', badgeRed: true },
    { key: 'mine', label: t('nav_mine'), icon: User },
    { key: 'others', label: t('nav_others'), icon: Users },
    { key: 'archive', label: t('nav_archive'), icon: Archive, badgeKey: 'archived' },
  ];

  const INVENTORY_ITEMS = [
    ...(userIsAdmin || userIsStaff ? [{ key: 'product_catalog', label: t('nav_product_catalog'), icon: BookMarked }] : []),
    { key: 'inventory_overview', label: t('nav_inventory_overview'), icon: Package },
    { key: 'inventory_inbound', label: t('nav_inbound'), icon: PackagePlus },
    { key: 'inventory_outbound', label: t('nav_outbound'), icon: PackageMinus },
    { key: 'inventory_lowstock', label: t('nav_low_stock'), icon: AlertCircle, badgeKey: 'lowStock', badgeRed: true },
    { key: 'inventory_adjustment', label: t('nav_adjustment'), icon: Sliders },
    { key: 'inventory_transfer', label: t('nav_transfer'), icon: ArrowLeftRight },
  ];

  const PURCHASING_ITEMS = [
    { key: 'po_list', label: t('nav_po_list'), icon: ShoppingCart, badgeKey: 'pendingPOs' },
    { key: 'suppliers', label: t('nav_suppliers'), icon: Building2 },
    { key: 'po_archive', label: t('nav_po_archive'), icon: Archive },
  ];

  const EXPENSE_ITEMS = [
    { key: 'expense_this_month', label: t('nav_expense_this_month'), icon: Wallet },
    { key: 'expense_history', label: t('nav_expense_history'), icon: BookOpen },
  ];

  return (
    <div className="w-[210px] min-w-[210px] h-screen flex flex-col overflow-y-auto custom-scrollbar" style={{ background: '#1E2433', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 pt-5 pb-4 flex-shrink-0">
        <AppNameLogo />
      </div>

      <nav className="flex-1 px-2 pb-2">
        {/* 工单 */}
        <SectionHeader label={t('nav_tickets')} collapsed={collapsed.ticket} onToggle={() => toggle('ticket')} />
        {!collapsed.ticket && TICKET_ITEMS.map(item => (
          <NavButton key={item.key} item={item} active={activeNav === item.key} badge={item.badgeKey ? badges[item.badgeKey] : null} badgeRed={item.badgeRed} onClick={() => onNavChange(item.key)} />
        ))}

        {/* 库存 */}
        <SectionHeader label={t('nav_inventory')} collapsed={collapsed.inventory} onToggle={() => toggle('inventory')} />
        {!collapsed.inventory && INVENTORY_ITEMS.map(item => (
          <NavButton key={item.key} item={item} active={activeNav === item.key} badge={item.badgeKey ? badges[item.badgeKey] : null} badgeRed={item.badgeRed} onClick={() => onNavChange(item.key)} />
        ))}

        {/* 采购 */}
        <SectionHeader label={t('nav_purchasing')} collapsed={collapsed.purchasing} onToggle={() => toggle('purchasing')} />
        {!collapsed.purchasing && PURCHASING_ITEMS.map(item => (
          <NavButton key={item.key} item={item} active={activeNav === item.key} badge={item.badgeKey ? badges[item.badgeKey] : null} onClick={() => onNavChange(item.key)} />
        ))}

        {/* 结算 — admin only */}
        {userIsAdmin && (
          <>
            <SectionHeader label={t('nav_settlement')} collapsed={collapsed.settlement} onToggle={() => toggle('settlement')} />
            {!collapsed.settlement && (
              <NavButton item={{ key: 'settlement', label: t('nav_supplier_settlement'), icon: CreditCard }} active={activeNav === 'settlement'} onClick={() => onNavChange('settlement')} />
            )}
          </>
        )}

        {/* 小账本 — staff + admin */}
        {(userIsAdmin || userIsStaff) && (
          <>
            <SectionHeader label={t('nav_expenses')} collapsed={collapsed.expenses} onToggle={() => toggle('expenses')} />
            {!collapsed.expenses && EXPENSE_ITEMS.map(item => (
              <NavButton key={item.key} item={item} active={activeNav === item.key} onClick={() => onNavChange(item.key)} />
            ))}
          </>
        )}

        {/* 项目计划 */}
        {(userIsAdmin || userIsStaff) && (
          <>
            <SectionHeader label="项目计划" collapsed={collapsed.planner} onToggle={() => toggle('planner')} />
            {!collapsed.planner && (
              <NavButton item={{ key: 'planner', label: '任务看板', icon: ClipboardList }} active={activeNav === 'planner'} onClick={() => onNavChange('planner')} />
            )}
          </>
        )}

        {/* Module 1 */}
        {(userIsAdmin || userIsStaff) && (
          <div className="mt-2">
            <NavButton item={{ key: 'omnichannel_setup', label: 'Omnichannel Setup', icon: MessageSquareMore }} active={activeNav === 'omnichannel_setup'} onClick={() => onNavChange('omnichannel_setup')} />
          </div>
        )}

        {/* 备忘录 */}
        <SectionHeader label={t('nav_memo')} collapsed={collapsed.memo} onToggle={() => toggle('memo')} />
        {!collapsed.memo && (
          <NavButton item={{ key: 'memos', label: t('nav_my_memo'), icon: BookOpen }} active={activeNav === 'memos'} onClick={() => onNavChange('memos')} />
        )}

        {/* System */}
        <div className="mt-3">
          <NavButton item={{ key: 'notifications', label: t('nav_notifications'), icon: Bell }} active={activeNav === 'notifications'} badge={badges.unreadNotifs} onClick={() => onNavChange('notifications')} />
          {userIsAdmin && (
            <NavButton item={{ key: 'settings', label: t('nav_settings'), icon: Settings }} active={activeNav === 'settings'} onClick={() => onNavChange('settings')} />
          )}
        </div>
      </nav>

      <UserFooter currentUser={currentUser} locale={locale} onToggleLocale={() => switchLocale(locale === 'zh' ? 'en' : 'zh')} onOpenProfile={() => onNavChange('profile')} />
    </div>
  );
}

function SupplierSidebar({ activeNav, onNavChange, badges, currentUser }) {
  const { t, locale, switchLocale } = useI18n();
  const items = [
    { key: 'po_list', label: t('nav_po_list'), icon: ShoppingCart },
    { key: 'settlement_supplier', label: t('nav_my_statement'), icon: CreditCard },
    { key: 'notifications', label: t('nav_notifications'), icon: Bell, badgeKey: 'unreadNotifs' },
  ];
  return (
    <div className="w-[210px] min-w-[210px] h-screen flex flex-col" style={{ background: '#1E2433', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 pt-5 pb-4"><AppNameLogo /></div>
      <nav className="flex-1 px-2 pb-2">
        <SectionHeader label={t('nav_purchasing')} collapsed={false} onToggle={() => {}} />
        {items.map(item => (
          <NavButton key={item.key} item={item} active={activeNav === item.key} badge={item.badgeKey ? badges[item.badgeKey] : null} onClick={() => onNavChange(item.key)} />
        ))}
      </nav>
      <UserFooter currentUser={currentUser} locale={locale} onToggleLocale={() => switchLocale(locale === 'zh' ? 'en' : 'zh')} onOpenProfile={() => onNavChange('profile')} />
    </div>
  );
}

function PartnerSidebar({ activeNav, onNavChange, badges, currentUser }) {
  const { t, locale, switchLocale } = useI18n();
  const items = [
    { key: 'inventory_overview', label: t('nav_inventory_overview'), icon: Package },
    { key: 'inventory_inbound', label: t('nav_inbound'), icon: PackagePlus },
    { key: 'inventory_outbound', label: t('nav_outbound'), icon: PackageMinus },
    { key: 'inventory_lowstock', label: t('nav_low_stock'), icon: AlertCircle, badgeKey: 'lowStock', badgeRed: true },
    { key: 'partner_bill', label: t('nav_my_bill'), icon: DollarSign },
    { key: 'notifications', label: t('nav_notifications'), icon: Bell, badgeKey: 'unreadNotifs' },
  ];
  return (
    <div className="w-[210px] min-w-[210px] h-screen flex flex-col" style={{ background: '#1E2433', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 pt-5 pb-4"><AppNameLogo /></div>
      <nav className="flex-1 px-2 pb-2">
        <SectionHeader label={t('nav_inventory')} collapsed={false} onToggle={() => {}} />
        {items.map(item => (
          <NavButton key={item.key} item={item} active={activeNav === item.key} badge={item.badgeKey ? badges[item.badgeKey] : null} badgeRed={item.badgeRed} onClick={() => onNavChange(item.key)} />
        ))}
      </nav>
      <UserFooter currentUser={currentUser} locale={locale} onToggleLocale={() => switchLocale(locale === 'zh' ? 'en' : 'zh')} onOpenProfile={() => onNavChange('profile')} />
    </div>
  );
}

function AppNameLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(212,175,55,0.15)' }}>
        <span className="text-[13px] font-bold" style={{ color: '#D4AF37' }}>OMB</span>
      </div>
      <div>
        <span className="text-[16px] font-bold tracking-wide" style={{ color: '#D4AF37' }}>OMB PIT</span>
        <div className="h-[2px] w-12 mt-0.5 rounded-full" style={{ background: '#D4AF37' }} />
      </div>
    </div>
  );
}

function SectionHeader({ label, collapsed, onToggle }) {
  return (
    <button onClick={onToggle} className="w-full flex items-center justify-between px-3 pb-1 pt-4 group">
      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
      {collapsed
        ? <ChevronRight className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.35)' }} />
        : <ChevronDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.35)' }} />}
    </button>
  );
}

function NavButton({ item, active, badge = null, badgeRed = false, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      style={active
        ? { color: '#C49A1A', background: 'rgba(196,154,26,0.18)' }
        : { color: 'rgba(255,255,255,0.6)' }
      }
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors',
        active ? '' : 'hover:bg-white/[0.06] hover:!text-white'
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      {badge > 0 && (
        <span className={cn(
          'text-[11px] font-medium px-1.5 py-0.5 rounded-md min-w-[20px] text-center',
          badgeRed ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/60'
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}

function UserFooter({ currentUser, locale, onToggleLocale, onOpenProfile }) {
  const handleLogout = () => base44?.auth?.logout('/login');
  const avatarColors = {
    admin: { bg: '#C49A1A', text: '#fff' },
    staff: { bg: '#4A5B7A', text: '#fff' },
    supplier: { bg: '#3B6D11', text: '#fff' },
    partner: { bg: '#993556', text: '#fff' },
  };
  const av = avatarColors[currentUser?.role] || avatarColors.staff;
  return (
    <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <button
        onClick={onOpenProfile}
        className="flex items-center gap-2.5 mb-2 w-full hover:opacity-80 transition-opacity text-left"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold flex-shrink-0"
          style={{ background: av.bg, color: av.text }}
        >
          {getInitials(currentUser?.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium truncate" style={{ color: '#FFFFFF' }}>{currentUser?.full_name || '用户'}</div>
          <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{getRoleLabel(currentUser?.role, locale)}</div>
        </div>
      </button>
      <div className="flex items-center justify-between">
        <button onClick={onToggleLocale} className="flex items-center gap-1 text-[11px] transition-colors" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <Globe className="w-3 h-3" />
          <span>{locale === 'zh' ? '中 / EN' : 'EN / 中'}</span>
        </button>
        <button onClick={handleLogout} className="text-[11px] transition-colors hover:text-red-400 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <LogOut className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
