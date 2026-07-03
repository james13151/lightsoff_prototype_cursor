import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/lib/settingsContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Paperclip } from 'lucide-react';
import { toastSuccess } from '@/lib/toast';

const PLATFORMS = ['Shopify', '速卖通', '手动', '其他'];

export default function InlineTicketEdit({ ticket, currentUser, users, onDone }) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const vf = settings.visible_fields;
  const isAdmin = currentUser?.role === 'admin';
  const isStaff = currentUser?.role === 'staff';

  // Only admin and staff can be assigned tickets
  const assignableUsers = (users || []).filter(u => u.role === 'admin' || u.role === 'staff');

  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setForm({
      title: ticket.title || '',
      ticket_type: ticket.ticket_type || '',
      order_number: ticket.order_number || '',
      tracking_number: ticket.tracking_number || '',
      customer_name: ticket.customer_name || '',
      customer_contact: ticket.customer_contact || '',
      platform: ticket.platform || '',
      priority: ticket.priority || '普通',
      due_date: ticket.due_date ? ticket.due_date.slice(0, 16) : '',
      assignee_id: ticket.assignee_id || '',
      assignee_name: ticket.assignee_name || '',
      attachments: ticket.attachments || [],
    });
  }, [ticket.id]);

  const handleAssigneeChange = (userId) => {
    const user = users?.find(u => u.id === userId);
    setForm(f => ({ ...f, assignee_id: userId, assignee_name: user?.full_name || '' }));
  };

  const handleFileUpload = async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  setUploading(true);
  const urls = [];
  for (const file of files) {
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    urls.push(file_url);
  }
  setForm(f => ({ ...f, attachments: [...f.attachments, ...urls] }));
  setUploading(false);
  toastSuccess('文件已上传');
  };

  const removeAttachment = (idx) => {
    setForm(f => ({ ...f, attachments: f.attachments.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);

    const data = { ...form };
    if (!vf.tracking_number) delete data.tracking_number;
    if (!vf.platform) delete data.platform;
    if (!vf.customer_contact) delete data.customer_contact;
    if (!vf.attachments) delete data.attachments;
    if (!vf.due_date) delete data.due_date;

    // Check assignee change for notification
    const assigneeChanged = ticket.assignee_id !== data.assignee_id && data.assignee_id;

    await base44.entities.Ticket.update(ticket.id, data);

    if (assigneeChanged) {
      const oldName = ticket.assignee_name || '未分配';
      await base44.entities.TimelineEntry.create({
        ticket_id: String(ticket.id),
        author_id: currentUser.id,
        author_name: currentUser.full_name,
        content: `将负责人从「${oldName}」改为「${data.assignee_name}」`,
        entry_type: 'assignment',
        is_system: true,
      });
      if (data.assignee_id !== currentUser.id) {
        await base44.entities.Notification.create({
          user_id: data.assignee_id,
          ticket_id: String(ticket.id),
          message: `${currentUser.full_name} 将工单「${data.title}」分配给了你`,
          is_read: false,
        });
      }
    }

    setSaving(false);
    toastSuccess('工单已更新');
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });
    queryClient.invalidateQueries({ queryKey: ['timeline', ticket.id] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    onDone();
  };

  return (
    <div className="px-6 py-4 border-b border-border bg-background/80">
      {/* Edit mode header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[13px] font-semibold text-foreground">编辑工单信息</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !form.title?.trim()}
            className="h-7 text-[11px] px-3 border-0"
            style={{ background: '#D4AF37', color: '#1a1e28' }}
          >
            {saving ? '保存中...' : '保存修改'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone} className="h-7 text-[11px] px-2">
            取消
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <F label="标题 *">
          <Input
            value={form.title || ''}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="工单标题"
            className="h-8 text-[13px] border-thin rounded-lg"
          />
        </F>

        <div className="grid grid-cols-2 gap-3">
          <F label="订单号">
            <Input
              value={form.order_number || ''}
              onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))}
              placeholder="订单号"
              className="h-8 text-[12px] border-thin rounded-lg"
            />
          </F>
          {vf.tracking_number && (
            <F label="追踪号">
              <Input
                value={form.tracking_number || ''}
                onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))}
                placeholder="追踪号"
                className="h-8 text-[12px] border-thin rounded-lg"
              />
            </F>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <F label="客户姓名">
            <Input
              value={form.customer_name || ''}
              onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
              placeholder="客户姓名"
              className="h-8 text-[12px] border-thin rounded-lg"
            />
          </F>
          {vf.customer_contact && (
            <F label="联系方式">
              <Input
                value={form.customer_contact || ''}
                onChange={e => setForm(f => ({ ...f, customer_contact: e.target.value }))}
                placeholder="联系方式"
                className="h-8 text-[12px] border-thin rounded-lg"
              />
            </F>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {vf.platform && (
            <F label="来源平台">
              <Select value={form.platform || ''} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                <SelectTrigger className="h-8 text-[12px] border-thin rounded-lg">
                  <SelectValue placeholder="选择平台" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
          )}
          <F label="负责人">
            <Select value={form.assignee_id || ''} onValueChange={handleAssigneeChange}>
              <SelectTrigger className="h-8 text-[12px] border-thin rounded-lg">
                <SelectValue placeholder="选择负责人" />
              </SelectTrigger>
              <SelectContent>
                {assignableUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <F label="工单类型">
            <Select value={form.ticket_type || ''} onValueChange={v => setForm(f => ({ ...f, ticket_type: v }))}>
              <SelectTrigger className="h-8 text-[12px] border-thin rounded-lg">
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                {['投诉', '退货', '物流异常', '咨询'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="优先级">
            <Select value={form.priority || '普通'} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger className="h-8 text-[12px] border-thin rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {settings.priority_levels.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          {vf.due_date && (
            <F label="截止日期">
              <Input
                type="datetime-local"
                value={form.due_date || ''}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="h-8 text-[12px] border-thin rounded-lg"
              />
            </F>
          )}
        </div>

        {vf.attachments && (
          <F label="附件">
            <div className="flex gap-2 flex-wrap items-center">
              {form.attachments?.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} alt="" className="w-10 h-10 rounded-md object-cover border border-thin border-border" />
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
              <label className="w-10 h-10 rounded-md border border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-accent/20 transition-colors">
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
              {uploading && <span className="text-[11px] text-muted-foreground">上传中...</span>}
            </div>
          </F>
        )}
      </div>
    </div>
  );
}

function F({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}