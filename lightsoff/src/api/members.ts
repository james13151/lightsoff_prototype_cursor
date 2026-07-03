import { apiFetch } from './client'
import type { MemberRole } from '../lib/permissions'

export interface TeamMember {
  tenantId: string
  userId: string
  role: MemberRole
  displayName: string
  email?: string
  joinedAt: string
}

export interface MeResponse {
  user_id: string
  tenant_id: string
  role: MemberRole
  display_name?: string
  email?: string
  permissions: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export function adaptMember(row: Row): TeamMember {
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name ?? row.user_id.slice(0, 8),
    email: row.email ?? undefined,
    joinedAt: row.joined_at,
  }
}

export async function fetchMe(token: string, tenantId: string): Promise<MeResponse> {
  return apiFetch<MeResponse>(`/v1/me?tenant_id=${tenantId}`, { token })
}

export async function fetchMembers(token: string, tenantId: string): Promise<TeamMember[]> {
  const rows = await apiFetch<Row[]>(`/v1/members?tenant_id=${tenantId}`, { token })
  return rows.map(adaptMember)
}

export async function inviteMember(
  token: string,
  data: { tenantId: string; userId: string; role?: 'admin' | 'member'; email?: string; displayName?: string },
) {
  return apiFetch<Row>('/v1/members', {
    method: 'POST',
    token,
    body: JSON.stringify({
      tenant_id: data.tenantId,
      user_id: data.userId,
      role: data.role ?? 'member',
      email: data.email,
      display_name: data.displayName,
    }),
  })
}

export async function updateMemberRole(
  token: string,
  userId: string,
  data: { tenantId: string; role: 'admin' | 'member' },
) {
  return apiFetch<Row>(`/v1/members/${userId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ tenant_id: data.tenantId, role: data.role }),
  })
}

export async function removeMember(token: string, tenantId: string, userId: string) {
  return apiFetch<void>(`/v1/members/${userId}?tenant_id=${tenantId}`, { method: 'DELETE', token })
}

export async function updateMyProfile(
  token: string,
  data: { email?: string; displayName?: string },
) {
  return apiFetch<Row>('/v1/me/profile', {
    method: 'PATCH',
    token,
    body: JSON.stringify({ email: data.email, display_name: data.displayName }),
  })
}
