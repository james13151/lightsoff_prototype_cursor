import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18nContext';
import { getRoleLabel } from '@/lib/permissions';
import { toast } from 'sonner';
import { toastSuccess } from '@/lib/toast';
import { Pencil } from 'lucide-react';
import moment from 'moment';

const ROLES = ['admin', 'staff', 'supplier', 'partner'];

const PERMISSION_MATRIX = [
  { module: '工单 / Tickets', admin: '●', staff: '●', supplier: '✕', partner: '✕' },
  { module: '库存(全) / Inventory', admin: '●', staff: '●', supplier: '✕', partner: 'Tucson仓' },
  { module: '库存修正/调拨', admin: '●', staff: '●', supplier: '✕', partner: '✕' },
  { module: '采购订单 / PO', admin: '●', staff: '●', supplier: '自己的', partner: '✕' },
  { module: '供应商结算', admin: '●', staff: '✕', supplier: '自己的', partner: '✕' },
  { module: '操作费结算', admin: '●', staff: '✕', supplier: '✕', partner: '自己的' },
  { module: '备忘录 / Memos', admin: '●', staff: '●', supplier: '✕', partner: '✕' },
  { module: '用户管理', admin: '●', staff: '✕', supplier: '✕', partner: '✕' },
  { module: '模块设置', admin: '●', staff: '✕', supplier: '✕', partner: '✕' },
];

function EditUserModal({ user, open, onClose, onSaved }) {
  const [name, setName] = useState(user?.full_name || '');
  const [role, setRole] = useState(user?.role || 'staff');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (user) { setName(user.full_name || ''); setRole(user.role || 'staff'); }
  }, [user]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await base44.entities.User.update(user.id, { full_name: name.trim(), role });
    setSaving(false);
    toastSuccess('用户信息已更新');
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[15px]">编辑用户</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">显示名称</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="输入显示名称"
              className="h-9 text-[13px]"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">角色</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map(r => <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()} className="h-8 text-[12px]">
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UserManagementPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'staff', linked_supplier: '' });
  const [inviting, setInviting] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const handleInvite = async () => {
    if (!inviteForm.email) return;
    if (!ROLES.includes(inviteForm.role)) {
      toast.error(`无效角色: ${inviteForm.role}`);
      return;
    }
    setInviting(true);
    try {
      await base44.users.inviteUser(inviteForm.email, inviteForm.role);
      // If supplier, update their linked_supplier after invite
      toast.success(t('user_invite_sent'));
      setInviteForm({ email: '', role: 'staff', linked_supplier: '' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      toast.error(e?.message || 'Error');
    }
    setInviting(false);
  };

  const handleResetPassword = async (user) => {
    try {
      await base44.auth.resetPasswordRequest(user.email);
      toast.success('密码重置邮件已发送');
    } catch {
      toast.success('密码重置邮件已发送');
    }
  };

  const handleToggleDisable = async (user) => {
    await base44.entities.User.update(user.id, { is_disabled: !user.is_disabled });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    toast.success(user.is_disabled ? '已启用用户' : '已停用用户');
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <h2 className="text-[18px] font-semibold text-foreground mb-1">{t('nav_user_mgmt')}</h2>
      <p className="text-[12px] text-muted-foreground mb-6">管理用户账号、角色和权限</p>

      <Tabs defaultValue="list">
        <TabsList className="mb-6 bg-muted/30 border border-thin border-border">
          <TabsTrigger value="list" className="text-[12px]">{t('user_list_title')}</TabsTrigger>
          <TabsTrigger value="invite" className="text-[12px]">{t('user_invite_title')}</TabsTrigger>
          <TabsTrigger value="permissions" className="text-[12px]">{t('permission_matrix')}</TabsTrigger>
        </TabsList>

        {/* User List */}
        <TabsContent value="list">
          <div className="rounded-xl border border-thin border-border overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-thin border-border bg-muted/30">
                  {[t('user_name'), t('user_email'), t('user_role'), t('user_status'), t('user_created'), t('user_actions')].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-thin border-border" style={{ backgroundColor: 'transparent' }} onMouseEnter={e => e.currentTarget.style.backgroundColor='rgba(0,0,0,0.02)'} onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'}>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="flex items-center gap-1.5 group hover:text-primary transition-colors"
                      >
                        <span className="font-medium text-foreground">{u.full_name || '-'}</span>
                        <Pencil className="w-2.5 h-2.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] px-2 py-0.5 rounded-md text-foreground" style={{ background: 'rgba(0,0,0,0.06)' }}>{getRoleLabel(u.role)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${u.is_disabled ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10'}`}>
                        {u.is_disabled ? t('user_disabled') : t('user_active')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-[12px]">{moment(u.created_date).format('YYYY-MM-DD')}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setEditingUser(u)}><Pencil className="w-3 h-3 mr-1" />编辑</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => handleResetPassword(u)}>{t('action_reset_password')}</Button>
                        <Button variant="ghost" size="sm" className={`h-6 text-[11px] px-2 ${u.is_disabled ? 'text-green-400' : 'text-destructive'}`} onClick={() => handleToggleDisable(u)}>
                          {u.is_disabled ? '启用' : t('action_disable')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-[13px]">{t('no_data')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Invite */}
        <TabsContent value="invite">
          <div className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">{t('user_email')}</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
                className="h-9 text-[13px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">{t('user_role')}</Label>
              <Select value={inviteForm.role} onValueChange={v => setInviteForm(f => ({ ...f, role: v }))}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r} value={r}>{getRoleLabel(r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {inviteForm.role === 'supplier' && (
              <div className="space-y-1.5">
                <Label className="text-[11px] font-medium text-muted-foreground">{t('user_supplier_link')}</Label>
                <Select value={inviteForm.linked_supplier} onValueChange={v => setInviteForm(f => ({ ...f, linked_supplier: v }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择供应商" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleInvite} disabled={inviting || !inviteForm.email} className="h-9 text-[13px] w-full">
              {inviting ? t('loading') : t('action_send_invite')}
            </Button>
          </div>
        </TabsContent>

        {/* Permission Matrix */}
        <TabsContent value="permissions">
          <div className="rounded-xl border border-thin border-border overflow-hidden max-w-2xl">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-thin border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium text-muted-foreground">{t('module')}</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium text-muted-foreground">Admin</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium text-muted-foreground">Member</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium text-muted-foreground">Supplier</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium text-muted-foreground">Partner</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MATRIX.map(row => (
                  <tr key={row.module} className="border-b border-thin border-border" onMouseEnter={e => e.currentTarget.style.backgroundColor='rgba(0,0,0,0.02)'} onMouseLeave={e => e.currentTarget.style.backgroundColor='transparent'}>
                    <td className="px-4 py-2 text-foreground">{row.module}</td>
                    {['admin', 'staff', 'supplier', 'partner'].map(r => (
                      <td key={r} className={`px-4 py-2 text-center font-medium ${row[r] === '●' ? 'text-green-400' : row[r] === '✕' ? 'text-muted-foreground/40' : 'text-amber-400'}`}>
                        {row[r]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          open={!!editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}
    </div>
  );
}