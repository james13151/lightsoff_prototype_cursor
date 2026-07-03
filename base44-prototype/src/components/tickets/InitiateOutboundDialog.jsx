import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import moment from 'moment';

const F = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
    {children}
  </div>
);

export default function InitiateOutboundDialog({ open, onClose, ticket, currentUser, onCreated }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    sku_ref: '',
    quantity: 1,
    recipient_name: '',
    recipient_address: '',
    recipient_contact: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && ticket) {
      setForm(f => ({
        ...f,
        recipient_name: ticket.customer_name || '',
        recipient_contact: ticket.customer_contact || '',
      }));
    }
  }, [open, ticket?.id]);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
    enabled: open,
  });

  const { data: inventoryStocks = [] } = useQuery({
    queryKey: ['inventory_stocks'],
    queryFn: () => base44.entities.InventoryStock.list(),
    enabled: open,
  });

  const tucsonProducts = products.filter(p => {
    const stock = inventoryStocks.find(s => s.sku_ref === p.id && s.warehouse === 'Tucson仓');
    return stock && stock.quantity > 0;
  });

  const selectedStock = inventoryStocks.find(s => s.sku_ref === form.sku_ref && s.warehouse === 'Tucson仓');

  const handleSave = async () => {
    if (!form.sku_ref || !form.quantity) return;
    setSaving(true);

    const product = products.find(p => p.id === form.sku_ref);

    // Create outbound record
    const outbound = await base44.entities.OutboundRecord.create({
      date: moment().format('YYYY-MM-DD'),
      sku_ref: form.sku_ref,
      sku_name: product?.name || '',
      quantity: Number(form.quantity),
      type: '销售出库',
      warehouse: 'Tucson仓',
      order_number: ticket?.order_number || '',
      recipient_name: form.recipient_name,
      recipient_address: form.recipient_address,
      recipient_contact: form.recipient_contact,
      notes: form.notes,
      linked_ticket_id: String(ticket.id),
      fulfillment_status: '待出库',
      operator_id: currentUser?.id,
      operator_name: currentUser?.full_name,
    });

    // Deduct Tucson仓 stock
    if (selectedStock) {
      await base44.entities.InventoryStock.update(selectedStock.id, {
        quantity: Math.max(0, (selectedStock.quantity || 0) - Number(form.quantity)),
      });
    }
    if (product) {
      await base44.entities.Product.update(product.id, {
        current_stock: Math.max(0, (product.current_stock || 0) - Number(form.quantity)),
      });
    }

    // Update ticket status → 待出库, link outbound
    await base44.entities.Ticket.update(ticket.id, {
      status: '待出库',
      linked_outbound_id: String(outbound.id),
    });

    // Notify all Partner users
    const allUsers = await base44.entities.User.list();
    const partners = allUsers.filter(u => u.role === 'partner');
    for (const partner of partners) {
      await base44.entities.Notification.create({
        user_id: partner.id,
        ticket_id: String(ticket.id),
        message: `新出库任务 — 订单 ${ticket.order_number || ticket.title}`,
        is_read: false,
      });
    }

    // Timeline entry
    await base44.entities.TimelineEntry.create({
      ticket_id: String(ticket.id),
      author_id: currentUser.id,
      author_name: currentUser.full_name,
      content: `已发起出库任务 — ${product?.name || ''}，数量：${form.quantity}，收货人：${form.recipient_name}`,
      entry_type: 'system',
      is_system: true,
    });

    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['ticket', ticket.id] });
    queryClient.invalidateQueries({ queryKey: ['outbound_records'] });
    queryClient.invalidateQueries({ queryKey: ['inventory_stocks'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });

    setSaving(false);
    onCreated?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 rounded-xl">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-[15px] font-semibold">发起出库任务</DialogTitle>
          <p className="text-[12px] text-muted-foreground">仓库：Tucson仓（自动）</p>
        </DialogHeader>
        <div className="px-6 pb-5 space-y-4">
          <F label="产品 *">
            <Select value={form.sku_ref} onValueChange={v => setForm(f => ({ ...f, sku_ref: v }))}>
              <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="选择产品" /></SelectTrigger>
              <SelectContent>
                {products.map(p => {
                  const s = inventoryStocks.find(s => s.sku_ref === p.id && s.warehouse === 'Tucson仓');
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku_id ? `[${p.sku_id}] ` : ''}{p.name}{s ? ` (库存: ${s.quantity})` : ' (库存: 0)'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {form.sku_ref && selectedStock && (
              <p className="text-[11px] text-muted-foreground">Tucson仓库存：<span className="text-foreground font-medium">{selectedStock.quantity}</span></p>
            )}
          </F>

          <F label="数量 *">
            <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))} className="h-9 text-[13px]" />
          </F>

          <div className="border-t border-thin border-border pt-4">
            <p className="text-[11px] text-muted-foreground mb-3 font-medium">收货信息</p>
            <div className="space-y-3">
              <F label="收货人">
                <Input value={form.recipient_name} onChange={e => setForm(f => ({ ...f, recipient_name: e.target.value }))} placeholder={ticket?.customer_name || ''} className="h-9 text-[13px]" />
              </F>
              <F label="联系方式">
                <Input value={form.recipient_contact} onChange={e => setForm(f => ({ ...f, recipient_contact: e.target.value }))} placeholder={ticket?.customer_contact || ''} className="h-9 text-[13px]" />
              </F>
              <F label="收货地址">
                <Input value={form.recipient_address} onChange={e => setForm(f => ({ ...f, recipient_address: e.target.value }))} placeholder="填写完整地址" className="h-9 text-[13px]" />
              </F>
            </div>
          </div>

          <F label="备注">
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="可选" className="h-9 text-[13px]" />
          </F>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} className="h-8 text-[12px]">取消</Button>
            <Button onClick={handleSave} disabled={saving || !form.sku_ref} className="h-8 text-[12px]">
              {saving ? '提交中...' : '发起出库'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}