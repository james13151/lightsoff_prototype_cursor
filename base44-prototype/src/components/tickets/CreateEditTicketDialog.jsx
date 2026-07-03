import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/lib/settingsContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Paperclip, X } from 'lucide-react';
import { toastSuccess } from '@/lib/toast';
import { canReceiveTicketNotification } from '@/lib/permissions';

const PLATFORMS = ['Shopify', '速卖通', '手动', '其他'];

export default function CreateEditTicketDialog({ open, onClose, ticket, currentUser, users }) {
  const queryClient = useQueryClient();
  const { settings, statusList } = useSettings();
  const assignableUsers = (users || []).filter(u => u.role === 'admin' || u.role === 'staff');
  const vf = settings.visible_fields;
  const isEdit = !!ticket;

  const [form, setForm] = useState({
    title: '', order_number: '', tracking_number: '', customer_name: '',
    customer_contact: '', platform: '', status: statusList[0], priority: '普通',
    ticket_type: '', due_date: '', assignee_id: '', assignee_name: '', attachments: [],
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ticket) {
      setForm({
        title: ticket.title || '',
        order_number: ticket.order_number || '',
        tracking_number: ticket.tracking_number || '',
        customer_name: ticket.customer_name || '',
        customer_contact: ticket.customer_contact || '',
        platform: ticket.platform || '',
        status: ticket.status || statusList[0],
        priority: ticket.priority || '普通',
        ticket_type: ticket.ticket_type || '',
        due_date: ticket.due_date ? ticket.due_date.slice(0, 16) : '',
        assignee_id: ticket.assignee_id || '',
        assignee_name: ticket.assignee_name || '',
        attachments: ticket.attachments || [],
      });
    } else {
      setForm({
        title: '', order_number: '', tracking_number: '', customer_name: '',
        customer_contact: '', platform: '', status: statusList[0], priority: '普通',
        ticket_type: '', due_date: '', assignee_id: '', assignee_name: '', attachments: [],
      });
    }
  }, [ticket, open]);

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

    if (isEdit) {
      await base44.entities.Ticket.update(ticket.id, data);
    } else {
      data.read_by = [currentUser.id];
      const created = await base44.entities.Ticket.create(data);

      await base44.entities.TimelineEntry.create({
        ticket_id: String(created.id),
        author_id: currentUser.id,
        author_name: currentUser.full_name,
        content: '创建了工单',
        entry_type: 'system',
      });

      // Notify assignee — only admin/staff may receive ticket notifications
      if (data.assignee_id && data.assignee_id !== currentUser.id) {
        const assignee = (users || []).find(u => u.id === data.assignee_id);
        if (canReceiveTicketNotification(assignee)) {
          await base44.entities.Notification.create({
            user_id: data.assignee_id,
            ticket_id: String(created.id),
            message: `你被分配了新工单 #${created.id}: ${data.title}`,
            is_read: false,
          });
        }
      }
    }

    setSaving(false);
    toastSuccess(isEdit ? '工单已更新' : '工单已创建');
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['ticket'] });
    queryClient.invalidateQueries({ queryKey: ['timeline'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-0 rounded-xl border-thin">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-[15px] font-semibold">
            {isEdit ? '编辑工单' : '新建工单'}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <Field label="标题 *">
            <Input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="工单标题"
              className="h-9 text-[13px] border-thin rounded-lg"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="订单号">
              <Input
                value={form.order_number}
                onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))}
                placeholder="输入订单号"
                className="h-9 text-[13px] border-thin rounded-lg"
              />
            </Field>
            {vf.tracking_number && (
              <Field label="追踪号">
                <Input
                  value={form.tracking_number}
                  onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))}
                  placeholder="输入追踪号"
                  className="h-9 text-[13px] border-thin rounded-lg"
                />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="客户姓名">
              <Input
                value={form.customer_name}
                onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                placeholder="客户姓名"
                className="h-9 text-[13px] border-thin rounded-lg"
              />
            </Field>
            {vf.customer_contact && (
              <Field label="联系方式">
                <Input
                  value={form.customer_contact}
                  onChange={e => setForm(f => ({ ...f, customer_contact: e.target.value }))}
                  placeholder="邮箱或手机号"
                  className="h-9 text-[13px] border-thin rounded-lg"
                />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {vf.platform && (
              <Field label="来源平台">
                <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger className="h-9 text-[13px] border-thin rounded-lg">
                    <SelectValue placeholder="选择平台" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="负责人">
              <Select value={form.assignee_id} onValueChange={handleAssigneeChange}>
                <SelectTrigger className="h-9 text-[13px] border-thin rounded-lg">
                  <SelectValue placeholder="选择负责人" />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="工单类型">
              <Select value={form.ticket_type} onValueChange={v => setForm(f => ({ ...f, ticket_type: v }))}>
                <SelectTrigger className="h-9 text-[13px] border-thin rounded-lg">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {['投诉', '退货', '物流异常', '咨询'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="优先级">
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger className="h-9 text-[13px] border-thin rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.priority_levels.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {vf.due_date && (
            <Field label="截止日期">
              <Input
                type="datetime-local"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="h-9 text-[13px] border-thin rounded-lg"
              />
            </Field>
          )}

          {vf.attachments && (
            <Field label="附件">
              <div className="flex gap-2 flex-wrap items-center">
                {form.attachments.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="w-12 h-12 rounded-md object-cover border border-thin border-border" />
                    <button
                      onClick={() => removeAttachment(i)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
                <label className="w-12 h-12 rounded-md border border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-accent transition-colors">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <input type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>
                {uploading && <span className="text-[11px] text-muted-foreground">上传中...</span>}
              </div>
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleSave} disabled={saving || !form.title.trim()} className="h-8 text-[12px]">
              {saving ? '保存中...' : (isEdit ? '保存修改' : '创建工单')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}