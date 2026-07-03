import React from 'react';
import { X, Settings, FileText, TrendingDown, BarChart2, Warehouse, ArrowLeftRight, Users, Receipt, History, CalendarCheck, MessageSquareMore } from 'lucide-react';
import { useI18n } from '@/lib/i18nContext';
import { isAdmin, isSupplier, isPartner } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export default function MobileMoreOverlay({ open, onClose, onNavChange, activeNav, currentUser, badges }) {
  const { t } = useI18n();
  if (!open) return null;

  const isAdminUser = isAdmin(currentUser);
  const isSupplierUser = isSupplier(currentUser);
  const isPartnerUser = isPartner(currentUser);

  const sections = [];

  // Inventory sub-pages
  if (!isSupplierUser) {
    sections.push({
      title: t('nav_inventory'),
      items: [
        { key: 'inventory_overview', label: t('nav_inventory_overview'), icon: BarChart2 },
        { key: 'inventory_inbound', label: t('nav_inbound'), icon: TrendingDown },
        { key: 'inventory_outbound', label: t('nav_outbound'), icon: TrendingDown },
        { key: 'inventory_lowstock', label: t('nav_low_stock'), icon: TrendingDown, badge: badges?.lowStock },
        { key: 'inventory_adjustment', label: t('nav_adjustment'), icon: Warehouse },
        { key: 'inventory_transfer', label: t('nav_transfer'), icon: ArrowLeftRight },
      ]
    });
  }

  // Purchasing sub-pages
  sections.push({
    title: t('nav_purchasing'),
    items: [
      { key: 'po_list', label: t('nav_po_list'), icon: FileText, badge: badges?.pendingPOs },
      ...(!isSupplierUser && !isPartnerUser ? [{ key: 'suppliers', label: t('nav_suppliers'), icon: Users }] : []),
    ]
  });

  // Ticket sub-pages (admin/staff)
  if (!isSupplierUser && !isPartnerUser) {
    sections.push({
      title: t('nav_tickets'),
      items: [
        { key: 'all', label: t('nav_all_tickets') },
        { key: 'urgent', label: t('nav_urgent'), badge: badges?.urgent },
        { key: 'mine', label: t('nav_mine') },
        { key: 'others', label: t('nav_others') },
      ]
    });
  }

  // Planner
  if (!isSupplierUser && !isPartnerUser) {
    sections.push({
      title: '项目计划',
      items: [{ key: 'planner', label: '任务看板', icon: CalendarCheck }]
    });
  }

  if (!isSupplierUser && !isPartnerUser) {
    sections.push({
      title: 'Module 1',
      items: [{ key: 'omnichannel_setup', label: 'Omnichannel Setup', icon: MessageSquareMore }]
    });
  }

  // More items
  const moreItems = [];
  if (!isSupplierUser && !isPartnerUser) moreItems.push({ key: 'memos', label: t('nav_memo'), icon: FileText, badge: badges?.memoCount });
  if (isAdminUser) moreItems.push({ key: 'expense_this_month', label: t('nav_expense_this_month'), icon: Receipt });
  if (isAdminUser) moreItems.push({ key: 'expense_history', label: t('nav_expense_history'), icon: History });
  if (isAdminUser) moreItems.push({ key: 'settlement', label: t('nav_settlement'), icon: BarChart2 });
  if (isPartnerUser || isAdminUser) moreItems.push({ key: 'partner_bill', label: t('nav_my_bill'), icon: Receipt });
  if (isAdminUser) moreItems.push({ key: 'user_management', label: t('nav_user_mgmt'), icon: Users });
  if (isAdminUser) moreItems.push({ key: 'settings', label: t('nav_settings'), icon: Settings });

  if (moreItems.length > 0) sections.push({ title: t('nav_more'), items: moreItems });

  const handleNav = (key) => {
    onNavChange(key);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col md:hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar flex-shrink-0">
        <span className="text-[16px] font-bold" style={{ color: '#D4AF37' }}>OMB PIT</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto py-4 space-y-6 px-4">
        {sections.map(section => (
          <div key={section.title}>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{section.title}</p>
            <div className="space-y-1">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = activeNav === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => handleNav(item.key)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                      isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                    )}
                    style={isActive ? { color: '#D4AF37' } : {}}
                  >
                    {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                    <span className="text-[15px] flex-1">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="text-[11px] font-bold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
