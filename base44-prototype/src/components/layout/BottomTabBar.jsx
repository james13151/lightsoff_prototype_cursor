import React from 'react';
import { LayoutList, Package, ShoppingCart, Bell, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18nContext';

const TICKET_PAGES = new Set(['all', 'urgent', 'mine', 'others']);
const INVENTORY_PAGES = new Set(['inventory_overview', 'inventory_inbound', 'inventory_outbound', 'inventory_lowstock', 'inventory_adjustment', 'inventory_transfer']);
const PURCHASING_PAGES = new Set(['po_list', 'suppliers']);

export default function BottomTabBar({ activeNav, onNavChange, badges, onOpenMore }) {
  const { t } = useI18n();

  const isTicket = TICKET_PAGES.has(activeNav);
  const isInventory = INVENTORY_PAGES.has(activeNav);
  const isPurchasing = PURCHASING_PAGES.has(activeNav);
  const isNotif = activeNav === 'notifications';

  const tabs = [
    { key: 'tickets', label: t('nav_tickets'), icon: LayoutList, active: isTicket, nav: 'all' },
    { key: 'inventory', label: t('nav_inventory'), icon: Package, active: isInventory, nav: 'inventory_overview' },
    { key: 'purchasing', label: t('nav_purchasing'), icon: ShoppingCart, active: isPurchasing, nav: 'po_list', badge: badges.pendingPOs },
    { key: 'notifications', label: t('nav_notifications'), icon: Bell, active: isNotif, nav: 'notifications', badge: badges.unreadNotifs },
    { key: 'more', label: t('nav_more'), icon: Menu, active: false, isDrawer: true },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden border-t border-border bg-sidebar flex">
      {tabs.map(tab => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            onClick={() => tab.isDrawer ? onOpenMore() : onNavChange(tab.nav)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] transition-colors',
              tab.active ? 'text-primary' : 'text-muted-foreground'
            )}
            style={tab.active ? { color: '#D4AF37' } : {}}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {tab.badge > 0 && (
                <span className="absolute -top-1 -right-1.5 text-[9px] font-bold bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}
            </div>
            <span className="bottom-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}