import { useState, type FormEvent } from 'react'
import { useStore } from '../store'
import { inviteMember, removeMember, updateMemberRole } from '../api/members'
import { ROLE_LABELS, ROLE_PERMISSIONS, type MemberRole, type Permission as AppPermission } from '../lib/permissions'
import { Badge, Button, Card, Field, FormPanel, Input, SectionTitle, Select } from './ui'

const PERMISSION_GROUPS: { label: string; keys: AppPermission[] }[] = [
  { label: 'Team', keys: ['team.view', 'team.invite', 'team.manage_roles', 'team.remove'] },
  { label: 'Finance', keys: ['finance.approve_claim', 'finance.post_journal', 'finance.pay_bill'] },
  { label: 'Inventory', keys: ['inventory.write', 'inventory.adjust'] },
  { label: 'System', keys: ['settings.tenant', 'credentials.manage'] },
]

export function TeamView() {
  const { state, spineMutate, auth, mode, role, can } = useStore()
  const currentUserId = auth?.userId ?? '11111111-1111-1111-1111-111111111111'

  const [inviteUserId, setInviteUserId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')

  async function onInvite(e: FormEvent) {
    e.preventDefault()
    if (!inviteUserId.trim() || !inviteName.trim()) return
    await spineMutate(
      () => inviteMember(auth!.token, {
        tenantId: auth!.tenantId,
        userId: inviteUserId.trim(),
        role: inviteRole,
        email: inviteEmail.trim() || undefined,
        displayName: inviteName.trim(),
      }),
      {
        type: 'ADD_TEAM_MEMBER',
        userId: inviteUserId.trim(),
        role: inviteRole,
        displayName: inviteName.trim(),
        email: inviteEmail.trim() || undefined,
      },
    )
    setInviteUserId('')
    setInviteEmail('')
    setInviteName('')
  }

  async function onRoleChange(userId: string, newRole: MemberRole) {
    if (newRole === 'owner') return
    await spineMutate(
      () => updateMemberRole(auth!.token, userId, { tenantId: auth!.tenantId, role: newRole as 'admin' | 'member' }),
      { type: 'UPDATE_TEAM_MEMBER_ROLE', userId, role: newRole },
    )
  }

  async function onRemove(userId: string) {
    await spineMutate(
      () => removeMember(auth!.token, auth!.tenantId, userId),
      { type: 'REMOVE_TEAM_MEMBER', userId },
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <SectionTitle sub="Workspace members and role-based permissions. Owners and admins manage the team; members can operate inventory and finance day-to-day.">
        Team & permissions
      </SectionTitle>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Signed in as</span>
          <span>{auth?.displayName ?? auth?.email ?? (mode === 'demo' ? 'Alex Chen (demo)' : currentUserId.slice(0, 8))}</span>
          <Badge tone={role === 'owner' ? 'emerald' : role === 'admin' ? 'sky' : 'slate'}>{ROLE_LABELS[role]}</Badge>
          {mode === 'demo' && <span className="text-xs text-amber-600">Demo mode — acting as owner</span>}
        </div>
      </Card>

      {can('team.invite') && (
        <form onSubmit={onInvite}>
          <FormPanel title="Invite member">
            <p className="mb-3 text-xs text-slate-500">
              In dev mode, use a UUID that exists in <code>auth.users</code> (e.g. Bob: 22222222-2222-2222-2222-222222222222).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="User ID">
                <Input value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)} placeholder="uuid" required />
              </Field>
              <Field label="Display name">
                <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Sam Rivera" required />
              </Field>
              <Field label="Email">
                <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="sam@brand.com" />
              </Field>
              <Field label="Role">
                <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" className="w-full">Add member</Button>
          </FormPanel>
        </form>
      )}

      <Card className="p-4">
        <div className="mb-3 text-sm font-medium text-slate-700">Members ({state.teamMembers.length})</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-2 font-medium">User</th>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Joined</th>
              {can('team.manage_roles') && <th className="py-2 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {state.teamMembers.map((m) => (
              <tr key={m.userId} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5">
                  <div className="font-medium">{m.displayName}</div>
                  <div className="font-mono text-xs text-slate-400">{m.email ?? m.userId.slice(0, 13) + '…'}</div>
                </td>
                <td className="py-2.5">
                  {can('team.manage_roles') && m.role !== 'owner' && m.userId !== currentUserId ? (
                    <Select
                      value={m.role}
                      onChange={(e) => void onRoleChange(m.userId, e.target.value as MemberRole)}
                      className="w-28"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </Select>
                  ) : (
                    <Badge tone={m.role === 'owner' ? 'emerald' : m.role === 'admin' ? 'sky' : 'slate'}>
                      {ROLE_LABELS[m.role]}
                    </Badge>
                  )}
                </td>
                <td className="py-2.5 text-xs text-slate-400">{new Date(m.joinedAt).toLocaleDateString()}</td>
                {can('team.manage_roles') && (
                  <td className="py-2.5 text-right">
                    {m.role !== 'owner' && m.userId !== currentUserId && (
                      <Button type="button" variant="ghost" onClick={() => void onRemove(m.userId)}>Remove</Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <div className="mb-3 text-sm font-medium text-slate-700">Permission matrix</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left text-slate-400">
              <th className="py-1.5 font-medium">Capability</th>
              <th className="py-1.5 text-center font-medium">Owner</th>
              <th className="py-1.5 text-center font-medium">Admin</th>
              <th className="py-1.5 text-center font-medium">Member</th>
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.flatMap((g) =>
              g.keys.map((perm) => (
                <tr key={perm} className="border-b border-slate-50">
                  <td className="py-1.5 text-slate-600">{g.label} · {perm.split('.').slice(1).join(' ')}</td>
                  {(['owner', 'admin', 'member'] as const).map((r) => (
                    <td key={r} className="py-1.5 text-center">{ROLE_PERMISSIONS[r].includes(perm) ? '✓' : '—'}</td>
                  ))}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
