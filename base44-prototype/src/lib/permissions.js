/**
 * Role-based permission helpers.
 * Roles: 'admin' | 'staff' | 'supplier' | 'partner'
 */

export function getRole(user) {
  return user?.role || 'staff';
}

export function isAdmin(user) {
  return getRole(user) === 'admin';
}

export function isStaff(user) {
  return getRole(user) === 'staff';
}

export function isSupplier(user) {
  return getRole(user) === 'supplier';
}

export function isPartner(user) {
  return getRole(user) === 'partner';
}

export function canAccessTickets(user) {
  const role = getRole(user);
  return role === 'admin' || role === 'staff';
}

export function canAccessInventory(user) {
  const role = getRole(user);
  return role === 'admin' || role === 'staff' || role === 'partner';
}

export function canAccessInventoryFull(user) {
  const role = getRole(user);
  return role === 'admin' || role === 'staff';
}

// Partner can only see Tucson仓
export function canSeeShanghai(user) {
  return !isPartner(user);
}

// Partner warehouse is locked to Tucson仓
export function getWarehouseFilter(user) {
  if (isPartner(user)) return 'Tucson仓';
  return null; // no filter
}

export function canAccessSettlement(user) {
  return isAdmin(user);
}

export function canAccessPartnerFees(user) {
  const role = getRole(user);
  return role === 'admin' || role === 'partner';
}

export function canAccessSettings(user) {
  return isAdmin(user);
}

export function canAccessUserManagement(user) {
  return isAdmin(user);
}

export function canAccessMemo(user) {
  const role = getRole(user);
  return role === 'admin' || role === 'staff';
}

export function canDeletePO(user) {
  return isAdmin(user);
}

export function canEditPO(user) {
  // admin: full, staff: view+create, supplier: own orders only, partner: no
  const role = getRole(user);
  return role === 'admin' || role === 'staff' || role === 'supplier';
}

export function canAccessPO(user) {
  const role = getRole(user);
  return role === 'admin' || role === 'staff' || role === 'supplier';
}

export function canAccessStockAdjustment(user) {
  return isAdmin(user) || isStaff(user);
}

export function canAccessWarehouseTransfer(user) {
  return isAdmin(user) || isStaff(user);
}

/**
 * Notification creation rules
 * Ticket notifications: only admin + staff may receive them
 * Supplier and partner must NEVER receive ticket-related notifications
 */
export function canReceiveTicketNotification(user) {
  const role = getRole(user);
  return role === 'admin' || role === 'staff';
}

/**
 * PO notifications:
 * Admin: always
 * Staff: only if they created/assigned
 * Supplier: only their own PO activity (handled by checking operator_id/supplier match)
 * Partner: never
 */
export function canReceivePONotification(user) {
  const role = getRole(user);
  return role === 'admin' || role === 'staff' || role === 'supplier';
}

/**
 * Allowed nav pages per role — any navigation attempt to a page not in this set
 * should be redirected to the default page.
 */
export const ALLOWED_PAGES = {
  admin:    null, // no restriction
  staff:    null, // no restriction
  supplier: new Set(['po_list', 'settlement_supplier', 'notifications', 'profile']),
  partner:  new Set(['inventory_overview', 'inventory_inbound', 'inventory_outbound', 'inventory_lowstock', 'partner_bill', 'notifications', 'profile']),
};

export const DEFAULT_PAGE = {
  admin:    'all',
  staff:    'all',
  supplier: 'po_list',
  partner:  'inventory_overview',
};

export function isAllowedPage(user, page) {
  const role = getRole(user);
  const allowed = ALLOWED_PAGES[role];
  if (!allowed) return true; // admin/staff: all pages allowed
  return allowed.has(page);
}

export function getRoleLabel(role, locale = 'zh') {
  const map = { admin: 'Admin', staff: 'Member', supplier: 'Supplier', partner: 'Partner' };
  return map[role] || role || 'Member';
}

export const ROLE_COLORS = {
  admin:    '#D4AF37',
  staff:    '#5B8FD4',
  supplier: '#6BBF8E',
  partner:  '#C47ED4',
};

export function getRoleColor(role) {
  return ROLE_COLORS[role] || '#5B8FD4';
}