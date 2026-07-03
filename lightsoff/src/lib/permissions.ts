export type MemberRole = 'owner' | 'admin' | 'member'

export type Permission =
  | 'team.view'
  | 'team.invite'
  | 'team.manage_roles'
  | 'team.remove'
  | 'settings.tenant'
  | 'credentials.manage'
  | 'finance.approve_claim'
  | 'finance.post_journal'
  | 'finance.pay_bill'
  | 'inventory.write'
  | 'inventory.adjust'

export const ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
  owner: [
    'team.view', 'team.invite', 'team.manage_roles', 'team.remove',
    'settings.tenant', 'credentials.manage',
    'finance.approve_claim', 'finance.post_journal', 'finance.pay_bill',
    'inventory.write', 'inventory.adjust',
  ],
  admin: [
    'team.view', 'team.invite', 'team.manage_roles', 'team.remove',
    'credentials.manage',
    'finance.approve_claim', 'finance.post_journal', 'finance.pay_bill',
    'inventory.write', 'inventory.adjust',
  ],
  member: [
    'team.view',
    'finance.post_journal', 'finance.pay_bill',
    'inventory.write', 'inventory.adjust',
  ],
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

export function can(role: MemberRole | undefined, permission: Permission): boolean {
  if (!role) return permission === 'team.view' || permission.startsWith('inventory.') || permission.startsWith('finance.post')
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function isAdmin(role: MemberRole | undefined): boolean {
  return role === 'owner' || role === 'admin'
}
