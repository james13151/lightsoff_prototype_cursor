import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, MapPin, Phone, User, Truck } from 'lucide-react';
import { useI18n } from '@/lib/i18nContext';
import moment from 'moment';

const CARRIERS = ['USPS', 'UPS', 'FedEx', 'DHL', 'Amazon Logistics', 'Other'];

function TaskCard({ record, currentUser, onShipped }) {
  const { t } = useI18n();
  const [carrier, setCarrier] = useState(record.carrier || '');
  const [tracking, setTracking] = useState(record.tracking_number || '');
  const [saving, setSaving] = useState(false);

  const alreadyShipped = record.fulfillment_status === '已发货';

  const handleMarkShipped = async () => {
    if (!carrier || !tracking) return;
    setSaving(true);
    await base44.entities.OutboundRecord.update(record.id, {
      carrier,
      tracking_number: tracking,
      fulfillment_status: '已发货',
    });

    if (record.linked_ticket_id) {
      await base44.entities.Ticket.update(record.linked_ticket_id, { status: '待发货' });

      await base44.entities.TimelineEntry.create({
        ticket_id: String(record.linked_ticket_id),
        author_id: currentUser.id,
        author_name: currentUser.full_name,
        content: `Partner shipped — Carrier: ${carrier}, Tracking: ${tracking}`,
        entry_type: 'system',
        is_system: true,
      });

      const allUsers = await base44.entities.User.list();
      const adminStaff = allUsers.filter(u => u.role === 'admin' || u.role === 'staff');
      for (const u of adminStaff) {
        await base44.entities.Notification.create({
          user_id: u.id,
          ticket_id: String(record.linked_ticket_id),
          message: `Partner shipped — Tracking: ${tracking}`,
          is_read: false,
        });
      }
    }

    setSaving(false);
    onShipped();
  };

  const statusLabel = alreadyShipped ? t('fulfillment_shipped') :
    record.fulfillment_status === '出库中' ? 'Processing' : 'Pending Fulfillment';

  return (
    <div className={`rounded-xl border border-thin p-4 space-y-3 ${alreadyShipped ? 'border-green-400/20 bg-green-400/5' : 'border-border bg-card'}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-[13px] font-semibold text-foreground">{record.sku_name}</span>
            <span className="text-[12px] font-bold text-primary">×{record.quantity}</span>
          </div>
          {record.order_number && (
            <p className="text-[11px] text-muted-foreground font-mono">{t('fulfillment_order_no')}: {record.order_number}</p>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          alreadyShipped ? 'bg-green-400/10 text-green-400' :
          record.fulfillment_status === '出库中' ? 'bg-blue-400/10 text-blue-400' :
          'bg-amber-400/10 text-amber-400'
        }`}>
          {statusLabel}
        </span>
      </div>

      {/* Recipient info */}
      <div className="rounded-lg bg-muted/30 px-3 py-2 space-y-1">
        {record.recipient_name && (
          <div className="flex items-center gap-2 text-[12px] text-foreground">
            <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            {record.recipient_name}
          </div>
        )}
        {record.recipient_contact && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Phone className="w-3 h-3 flex-shrink-0" />
            {record.recipient_contact}
          </div>
        )}
        {record.recipient_address && (
          <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
            <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>{record.recipient_address}</span>
          </div>
        )}
      </div>

      {/* Carrier + tracking */}
      {alreadyShipped ? (
        <div className="flex items-center gap-2 text-[12px] text-green-400">
          <Truck className="w-3.5 h-3.5" />
          {record.carrier} — {record.tracking_number}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{t('fulfillment_carrier')}</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder={t('fulfillment_select_carrier')} /></SelectTrigger>
                <SelectContent>
                  {CARRIERS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{t('fulfillment_tracking')}</Label>
              <Input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="e.g. 9400111899..." className="h-8 text-[12px]" />
            </div>
          </div>
          <Button
            onClick={handleMarkShipped}
            disabled={saving || !carrier || !tracking}
            className="w-full h-8 text-[12px]"
          >
            {saving ? t('fulfillment_submitting') : t('fulfillment_mark_shipped')}
          </Button>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">{moment(record.date).format('YYYY-MM-DD')}</p>
    </div>
  );
}

export default function FulfillmentTaskView({ currentUser }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: records = [] } = useQuery({
    queryKey: ['outbound_records'],
    queryFn: () => base44.entities.OutboundRecord.list('-date', 200),
    refetchInterval: 15000,
  });

  const fulfillmentTasks = records.filter(r =>
    r.warehouse === 'Tucson仓' && r.linked_ticket_id
  );

  const pending = fulfillmentTasks.filter(r => r.fulfillment_status !== '已发货');
  const shipped = fulfillmentTasks.filter(r => r.fulfillment_status === '已发货');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['outbound_records'] });
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'], exact: false });
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
      <div className="mb-6">
        <h1 className="text-[18px] font-semibold text-foreground">{t('fulfillment_title')}</h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">{t('fulfillment_subtitle')}</p>
      </div>

      {pending.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider mb-3">
            {t('fulfillment_pending')} ({pending.length})
          </p>
          <div className="space-y-3">
            {pending.map(r => (
              <TaskCard key={r.id} record={r} currentUser={currentUser} onShipped={refresh} />
            ))}
          </div>
        </div>
      )}

      {shipped.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t('fulfillment_shipped')} ({shipped.length})
          </p>
          <div className="space-y-3">
            {shipped.map(r => (
              <TaskCard key={r.id} record={r} currentUser={currentUser} onShipped={refresh} />
            ))}
          </div>
        </div>
      )}

      {fulfillmentTasks.length === 0 && (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-[13px]">
          {t('fulfillment_empty')}
        </div>
      )}
    </div>
  );
}