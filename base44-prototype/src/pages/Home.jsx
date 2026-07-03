import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/lib/settingsContext';
import { isAdmin, isSupplier, isPartner, isStaff, canAccessTickets, canAccessInventory, isAllowedPage, DEFAULT_PAGE } from '@/lib/permissions';
import { useI18n } from '@/lib/i18nContext';
import { setLocale } from '@/lib/i18n';
import PartnerBillPage from './PartnerBillPage';
import ExpensePage from './ExpensePage';
import Sidebar from '@/components/layout/Sidebar';
import BottomTabBar from '@/components/layout/BottomTabBar';
import MobileMoreOverlay from '@/components/layout/MobileMoreOverlay';
import TicketList from '@/components/tickets/TicketList';
import TicketDetail from '@/components/tickets/TicketDetail';
import CreateEditTicketDialog from '@/components/tickets/CreateEditTicketDialog';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import ModuleSettings from './ModuleSettings';
import MemoPage from './MemoPage';
import SettlementPage from './SettlementPage';
import OmnichannelSetup from './OmnichannelSetup';
import { ArrowLeft } from 'lucide-react';
import { toastSuccess } from '@/lib/toast';

// Inventory
import ProductCatalogPage from './inventory/ProductCatalogPage';
import InventoryOverview from './inventory/InventoryOverview';
import InboundPage from './inventory/InboundPage';
import OutboundPage from './inventory/OutboundPage';
import FulfillmentTaskView from '@/components/inventory/FulfillmentTaskView';
import LowStockPage from './inventory/LowStockPage';
import StockAdjustmentPage from './inventory/StockAdjustmentPage';
import WarehouseTransferPage from './inventory/WarehouseTransferPage';

import ProfileSettingsPage from './ProfileSettingsPage';

// Purchasing
import POListPage from './purchasing/POListPage';
import PODetailPage from './purchasing/PODetailPage';
import SupplierManagementPage from './purchasing/SupplierManagementPage';
import POArchivePage from './purchasing/POArchivePage';
import ArchivePage from './tickets/ArchivePage';
import PlannerPage from './planner/PlannerPage';

const INVENTORY_PAGES = new Set(['product_catalog', 'inventory_overview', 'inventory_inbound', 'inventory_outbound', 'inventory_lowstock', 'inventory_adjustment', 'inventory_transfer']);
const PURCHASING_PAGES = new Set(['po_list', 'suppliers', 'po_archive']);
const PLANNER_PAGES = new Set(['planner']);
const TICKET_PAGES = new Set(['all', 'urgent', 'mine', 'others', 'archive']);

// Mobile top bar
function MobileTopBar({ title, onBack }) {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 py-3 flex-shrink-0"
      style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {onBack && (
        <button onClick={onBack} className="p-1" style={{ color: 'rgba(26,30,40,0.65)' }}>
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}
      <span className="text-[15px] font-bold flex-1 truncate" style={{ color: onBack ? '#1A1E28' : '#C49A1A' }}>
        {title || 'OMB PIT'}
      </span>
    </div>
  );
}

export default function Home() {
  const [activeNav, setActiveNav] = useState(null); // null = waiting for user role
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [selectedPOId, setSelectedPOId] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const { statusList } = useSettings();
  const queryClient = useQueryClient();
  const { switchLocale, t } = useI18n();

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const isMobile = windowWidth < 768;

  useEffect(() => {
    base44.auth.me().then(u => {
      setCurrentUser(u);
      if (u?.locale_preference) {
        switchLocale(u.locale_preference);
        setLocale(u.locale_preference);
      } else if (u?.role === 'partner') {
        switchLocale('en');
        setLocale('en');
      }
      // Set role-correct default page immediately — never let supplier start on ticket page
      const defaultPage = DEFAULT_PAGE[u?.role] || 'all';
      setActiveNav(defaultPage);
    }).catch(() => {});
  }, []);

  const userIsSupplier = isSupplier(currentUser);
  const userIsPartner = isPartner(currentUser);

  // Hard gate: never render content until we know the user's role
  // This prevents any ticket data or UI from flashing for supplier/partner
  const userLoaded = currentUser !== null && activeNav !== null;

  const { data: allTickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const all = await base44.entities.Ticket.list('-created_date', 500);
      // Exclude archived tickets from main list
      return all.filter(t => !t.is_archived);
    },
    enabled: canAccessTickets(currentUser),
    refetchInterval: 15000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: !!currentUser,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      // STRICT: always filter by current user's id — never show another user's notifications
      return base44.entities.Notification.filter({ user_id: currentUser.id }, '-created_date', 100);
    },
    enabled: !!currentUser?.id,
    refetchInterval: 15000,
  });

  const { data: memos = [] } = useQuery({
    queryKey: ['memos', currentUser?.id],
    queryFn: () => currentUser ? base44.entities.Memo.filter({ owner_id: currentUser.id }, '-updated_date', 200) : [],
    enabled: !!currentUser,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date', 500),
    enabled: canAccessInventory(currentUser),
    refetchInterval: 30000,
  });

  const { data: allPOs = [] } = useQuery({
    queryKey: ['purchase_orders'],
    queryFn: () => base44.entities.PurchaseOrder.list('-created_date', 500),
    enabled: !!currentUser,
    refetchInterval: 20000,
  });

  const unreadNotifCount = notifications.filter(n => !n.is_read).length;
  const lowStockCount = products.filter(p => p.current_stock < p.safety_stock).length;
  const pendingPOsCount = allPOs.filter(po => po.production_status === '待供应商确认').length;

  // Auto-archive resolved tickets when they appear in the list
  const resolvedIds = allTickets.filter(t => t.status === '已解决').map(t => t.id).join(',');
  React.useEffect(() => {
    const resolved = allTickets.filter(t => t.status === '已解决');
    if (resolved.length === 0) return;
    (async () => {
      for (const ticket of resolved) {
        await base44.entities.Ticket.update(ticket.id, {
          is_archived: true,
          archived_reason: '已解决',
          pre_archive_status: '已解决',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['tickets_archived'] });
      queryClient.invalidateQueries({ queryKey: ['tickets_archived_count'] });
    })();
  }, [resolvedIds]);

  const tickets = useMemo(() => {
    switch (activeNav) {
      case 'urgent': return allTickets.filter(t => t.priority === '紧急' && t.status !== '已解决');
      case 'mine': return allTickets.filter(t => t.assignee_id === currentUser?.id);
      case 'others': return allTickets.filter(t => t.assignee_id && t.assignee_id !== currentUser?.id);
      default: return allTickets;
    }
  }, [activeNav, allTickets, currentUser]);

  const { data: archivedTickets = [] } = useQuery({
    queryKey: ['tickets_archived_count'],
    queryFn: () => base44.entities.Ticket.filter({ is_archived: true }, '-updated_date', 1000),
    enabled: canAccessTickets(currentUser),
    refetchInterval: 30000,
  });

  const badges = useMemo(() => ({
    totalOpen: allTickets.length,
    urgent: allTickets.filter(t => t.priority === '紧急').length,
    unreadNotifs: unreadNotifCount,
    memoCount: memos.length,
    lowStock: lowStockCount,
    pendingPOs: pendingPOsCount,
    archived: archivedTickets.length,
  }), [allTickets, unreadNotifCount, memos, lowStockCount, pendingPOsCount, archivedTickets]);

  const handleSelectTicket = (id) => {
    if (!canAccessTickets(currentUser)) return; // supplier/partner cannot view tickets
    setSelectedTicketId(id);
    if (!TICKET_PAGES.has(activeNav)) setActiveNav('all');
  };

  const handleDelete = async (id) => {
    // Archive instead of hard-delete from main view
    const ticket = allTickets.find(t => t.id === id);
    await base44.entities.Ticket.update(id, {
      is_archived: true,
      archived_reason: '已删除',
      pre_archive_status: ticket?.status || '待处理',
    });
    await base44.entities.TimelineEntry.create({
      ticket_id: String(id),
      author_id: currentUser?.id,
      author_name: currentUser?.full_name,
      content: '工单已归档（标记为删除）',
      entry_type: 'system',
      is_system: true,
    });
    toastSuccess('工单已归档');
    setSelectedTicketId(null);
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['tickets_archived'] });
  };

  const handleNavChange = (key) => {
    // Enforce role-based page access — redirect to default if not allowed
    if (!isAllowedPage(currentUser, key)) {
      const defaultPage = DEFAULT_PAGE[currentUser?.role] || 'all';
      setActiveNav(defaultPage);
      setSelectedTicketId(null);
      setSelectedPOId(null);
      return;
    }
    setActiveNav(key);
    setSelectedTicketId(null);
    setSelectedPOId(null);
  };

  const navTitles = {
    all: '全部工单', urgent: '紧急工单', mine: '我负责的', others: '同事负责的',
    archive: '归档', product_catalog: '产品目录', inventory_overview: '库存总览', inventory_inbound: '入库', inventory_outbound: '出库',
    inventory_lowstock: '低库存预警', inventory_adjustment: '库存调整', inventory_transfer: '库存调拨',
    po_list: '采购订单', suppliers: '供应商管理', po_archive: '已归档采购单',
    planner: '项目计划',
    omnichannel_setup: 'Omnichannel Setup',
    memos: '备忘录', settlement: '结算管理', partner_bill: 'Partner账单',
    expense_this_month: '本月支出', expense_history: '历史支出',
    settings: '模块设置', profile: '个人资料',
  };

  // Guard: if current page is not allowed for this role, snap to default
  const effectiveNav = (currentUser && !isAllowedPage(currentUser, activeNav))
    ? (DEFAULT_PAGE[currentUser.role] || 'all')
    : activeNav;

  const isTicketPage = TICKET_PAGES.has(effectiveNav);
  const isNotifPage = effectiveNav === 'notifications';

  const handleNameUpdated = () => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  };

  // ── DESKTOP: full sidebar + split column layout ──────────────────
  const renderDesktopContent = () => {
    if (effectiveNav === 'profile') return <ProfileSettingsPage currentUser={currentUser} onNameUpdated={handleNameUpdated} />;
    if (effectiveNav === 'settings' && isAdmin(currentUser)) return <ModuleSettings />;
    if (effectiveNav === 'omnichannel_setup' && (isAdmin(currentUser) || isStaff(currentUser))) return <OmnichannelSetup currentUser={currentUser} />;
    if (effectiveNav === 'memos') return <MemoPage currentUser={currentUser} />;
    if (effectiveNav === 'settlement' && isAdmin(currentUser)) return <SettlementPage currentUser={currentUser} onNavigateToPO={(id) => { setSelectedPOId(id); handleNavChange('po_list'); }} />;
    if (effectiveNav === 'archive') return <ArchivePage currentUser={currentUser} users={users} onDelete={handleDelete} />;
    // must check archive before generic ticket pages below
    if (effectiveNav === 'product_catalog') return <ProductCatalogPage currentUser={currentUser} />;
    if (effectiveNav === 'inventory_overview') return <InventoryOverview currentUser={currentUser} />;
    if (effectiveNav === 'inventory_inbound') return <InboundPage currentUser={currentUser} onNavigateToPO={(id) => { setSelectedPOId(id); handleNavChange('po_list'); }} />;
    if (effectiveNav === 'inventory_outbound') return userIsPartner ? <FulfillmentTaskView currentUser={currentUser} /> : <OutboundPage currentUser={currentUser} />;
    if (effectiveNav === 'inventory_lowstock') return <LowStockPage currentUser={currentUser} />;
    if (effectiveNav === 'inventory_adjustment') return <StockAdjustmentPage currentUser={currentUser} />;
    if (effectiveNav === 'inventory_transfer') return <WarehouseTransferPage currentUser={currentUser} />;
    if (effectiveNav === 'po_list') {
      if (selectedPOId) return <PODetailPage poId={selectedPOId} currentUser={currentUser} onBack={() => setSelectedPOId(null)} />;
      return <POListPage currentUser={currentUser} onSelectPO={setSelectedPOId} />;
    }
    if (effectiveNav === 'planner') return <PlannerPage currentUser={currentUser} />;
    if (effectiveNav === 'suppliers') return <SupplierManagementPage currentUser={currentUser} />;
    if (effectiveNav === 'po_archive') return <POArchivePage currentUser={currentUser} />;
    if (effectiveNav === 'partner_bill') return <PartnerBillPage currentUser={currentUser} />;
    if (effectiveNav === 'settlement_supplier' && userIsSupplier) return <PartnerBillPage currentUser={currentUser} />;
    if (effectiveNav === 'expense_this_month') return <ExpensePage currentUser={currentUser} view="this_month" />;
    if (effectiveNav === 'expense_history') return <ExpensePage currentUser={currentUser} view="history" />;

    // Ticket split — hard guard: supplier/partner must NEVER reach this
    if (!canAccessTickets(currentUser)) {
      return <POListPage currentUser={currentUser} />;
    }
    return (
      <>
        <TicketList
          tickets={tickets}
          statusList={statusList}
          selectedTicketId={selectedTicketId}
          currentUserId={currentUser?.id}
          unreadNotifCount={unreadNotifCount}
          onSelectTicket={handleSelectTicket}
          onCreateNew={() => setShowCreateDialog(true)}
          onOpenNotifications={() => setShowNotifPanel(true)}
          pageTitle={navTitles[activeNav] || '全部工单'}
        />
        <div className="flex flex-1 overflow-hidden">
          <TicketDetail
            ticketId={selectedTicketId}
            currentUser={currentUser}
            users={users}
            onDelete={handleDelete}
            onOpenMemos={() => setActiveNav('memos')}
            onInitiatePO={() => setActiveNav('po_list')}
          />
        </div>
      </>
    );
  };

  // ── MOBILE: single column, one view at a time ────────────────────
  const renderMobileContent = () => {
    // Ticket detail view (full screen)
    if (isTicketPage && selectedTicketId && canAccessTickets(currentUser)) {
      return (
        <div className="fixed inset-0 z-40 bg-background flex flex-col">
          {/* Mobile detail top bar */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <button onClick={() => setSelectedTicketId(null)} className="p-1" style={{ color: 'rgba(26,30,40,0.65)' }}>
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-[15px] font-semibold flex-1 truncate" style={{ color: '#1A1E28' }}>工单详情</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <TicketDetail
              ticketId={selectedTicketId}
              currentUser={currentUser}
              users={users}
              onDelete={(id) => { handleDelete(id); setSelectedTicketId(null); }}
              onOpenMemos={() => { setSelectedTicketId(null); handleNavChange('memos'); }}
              onInitiatePO={() => { setSelectedTicketId(null); handleNavChange('po_list'); }}
            />
          </div>
        </div>
      );
    }

    // Archive page
    if (effectiveNav === 'archive') {
      return (
        <div className="w-full flex flex-col flex-1 overflow-hidden">
          <ArchivePage currentUser={currentUser} users={users} onDelete={handleDelete} />
        </div>
      );
    }

    // Ticket list (full width, no detail pane) — guard supplier/partner
    if (isTicketPage && canAccessTickets(currentUser)) {
      return (
        <div className="w-full flex flex-col flex-1 overflow-hidden">
          <TicketList
            tickets={tickets}
            statusList={statusList}
            selectedTicketId={null}
            currentUserId={currentUser?.id}
            unreadNotifCount={unreadNotifCount}
            onSelectTicket={handleSelectTicket}
            onCreateNew={() => setShowCreateDialog(true)}
            onOpenNotifications={() => setShowNotifPanel(true)}
            pageTitle={navTitles[effectiveNav] || '全部工单'}
          />
        </div>
      );
    }

    // All other pages — full screen single column
    const pageTitle = navTitles[effectiveNav] || 'OMB PIT';
    let pageContent = null;
    if (effectiveNav === 'profile') pageContent = <ProfileSettingsPage currentUser={currentUser} onNameUpdated={handleNameUpdated} />;
    else if (effectiveNav === 'settings' && isAdmin(currentUser)) pageContent = <ModuleSettings />;
    else if (effectiveNav === 'omnichannel_setup' && (isAdmin(currentUser) || isStaff(currentUser))) pageContent = <OmnichannelSetup currentUser={currentUser} />;
    else if (effectiveNav === 'memos') pageContent = <MemoPage currentUser={currentUser} />;
    else if (effectiveNav === 'settlement' && isAdmin(currentUser)) pageContent = <SettlementPage currentUser={currentUser} onNavigateToPO={(id) => { setSelectedPOId(id); handleNavChange('po_list'); }} />;
    else if (effectiveNav === 'product_catalog') pageContent = <ProductCatalogPage currentUser={currentUser} />;
    else if (effectiveNav === 'inventory_overview') pageContent = <InventoryOverview currentUser={currentUser} />;
    else if (effectiveNav === 'inventory_inbound') pageContent = <InboundPage currentUser={currentUser} onNavigateToPO={(id) => { setSelectedPOId(id); handleNavChange('po_list'); }} />;
    else if (effectiveNav === 'inventory_outbound') pageContent = userIsPartner ? <FulfillmentTaskView currentUser={currentUser} /> : <OutboundPage currentUser={currentUser} />;
    else if (effectiveNav === 'inventory_lowstock') pageContent = <LowStockPage currentUser={currentUser} />;
    else if (effectiveNav === 'inventory_adjustment') pageContent = <StockAdjustmentPage currentUser={currentUser} />;
    else if (effectiveNav === 'inventory_transfer') pageContent = <WarehouseTransferPage currentUser={currentUser} />;
    else if (effectiveNav === 'po_list') {
      if (selectedPOId) pageContent = <PODetailPage poId={selectedPOId} currentUser={currentUser} onBack={() => setSelectedPOId(null)} />;
      else pageContent = <POListPage currentUser={currentUser} onSelectPO={setSelectedPOId} />;
    }
    else if (effectiveNav === 'planner') pageContent = <PlannerPage currentUser={currentUser} />;
    else if (effectiveNav === 'suppliers') pageContent = <SupplierManagementPage currentUser={currentUser} />;
    else if (effectiveNav === 'po_archive') pageContent = <POArchivePage currentUser={currentUser} />;
    else if (effectiveNav === 'partner_bill') pageContent = <PartnerBillPage currentUser={currentUser} />;
    else if (effectiveNav === 'settlement_supplier' && userIsSupplier) pageContent = <PartnerBillPage currentUser={currentUser} />;
    else if (effectiveNav === 'expense_this_month') pageContent = <ExpensePage currentUser={currentUser} view="this_month" />;
    else if (effectiveNav === 'expense_history') pageContent = <ExpensePage currentUser={currentUser} view="history" />;

    return (
      <div className="w-full flex flex-col flex-1 overflow-hidden">
        {pageContent}
      </div>
    );
  };

  // Show spinner until we know the user role — prevents supplier seeing ticket page for even 1 frame
  if (!userLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F4F5F7' }}>

      {/* ── DESKTOP ── */}
      <div className="hidden md:flex">
        <Sidebar activeNav={effectiveNav} onNavChange={handleNavChange} badges={badges} currentUser={currentUser} />
      </div>
      <div className="hidden md:flex flex-1 overflow-hidden">
        {renderDesktopContent()}
      </div>

      {/* ── MOBILE ── */}
      <div className="md:hidden flex flex-col w-full h-screen">
        {/* Top bar — shown only when NOT in ticket detail (ticket detail has its own) */}
        {!(isTicketPage && selectedTicketId) && (
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <span className="text-[15px] font-bold flex-1 truncate" style={{ color: '#C49A1A' }}>
              {isTicketPage ? 'OMB PIT' : (navTitles[effectiveNav] || 'OMB PIT')}
            </span>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-hidden flex flex-col pb-[56px]">
          {renderMobileContent()}
        </div>

        {/* Bottom tab bar */}
        <BottomTabBar
          activeNav={effectiveNav}
          onNavChange={handleNavChange}
          badges={badges}
          onOpenMore={() => setMobileMoreOpen(true)}
        />
      </div>

      {/* Mobile More overlay */}
      <MobileMoreOverlay
        open={mobileMoreOpen}
        onClose={() => setMobileMoreOpen(false)}
        onNavChange={handleNavChange}
        activeNav={effectiveNav}
        currentUser={currentUser}
        badges={badges}
      />

      {/* Dialogs / panels (shared mobile+desktop) */}
      <CreateEditTicketDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        ticket={null}
        currentUser={currentUser}
        users={users}
      />

      <NotificationPanel
        open={showNotifPanel || isNotifPage}
        onClose={() => {
          setShowNotifPanel(false);
          if (isNotifPage) setActiveNav(userIsSupplier ? 'po_list' : 'all');
        }}
        notifications={notifications}
        currentUserId={currentUser?.id}
        currentUser={currentUser}
        onSelectTicket={handleSelectTicket}
      />
    </div>
  );
}
