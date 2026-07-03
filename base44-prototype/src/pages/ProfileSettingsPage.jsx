import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toastSuccess } from '@/lib/toast';
import { getInitials } from '@/lib/helpers';

export default function ProfileSettingsPage({ currentUser, onNameUpdated }) {
  const [name, setName] = useState(currentUser?.full_name || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(currentUser?.full_name || '');
  }, [currentUser?.full_name]);

  const hasChange = name.trim() && name.trim() !== (currentUser?.full_name || '');

  const handleSave = async () => {
    if (!hasChange) return;
    setSaving(true);
    try {
      // Try auth.updateMe first; fall back to User.update if user has id
      await base44.auth.updateMe({ full_name: name.trim() });
    } catch {
      if (currentUser?.id) {
        await base44.entities.User.update(currentUser.id, { full_name: name.trim() });
      }
    }
    setSaving(false);
    toastSuccess('显示名称已更新');
    onNameUpdated?.();
  };

  const initials = getInitials(name || currentUser?.full_name || '?');

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-md">
      <h2 className="text-[18px] font-semibold text-foreground mb-1">个人资料</h2>
      <p className="text-[12px] text-muted-foreground mb-6">管理你的显示名称</p>

      {/* Avatar preview */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-muted/20 border border-thin border-border">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-bold flex-shrink-0"
          style={{ background: '#D4AF37', color: '#1A1E28' }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-foreground truncate">{name || currentUser?.full_name || '-'}</p>
          <p className="text-[12px] text-muted-foreground truncate">{currentUser?.email}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-medium text-muted-foreground">显示名称 / Display Name</Label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            placeholder="输入显示名称"
            className="h-9 text-[13px]"
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !hasChange}
          className="h-9 text-[13px] w-full"
        >
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  );
}