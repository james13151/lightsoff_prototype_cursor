import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const SettingsContext = createContext(null);

export const DEFAULT_TICKET_STATUSES = [
  { value: '待处理', label_zh: '待处理', label_en: 'Pending', color: '#9E9E9E' },
  { value: '处理中', label_zh: '处理中', label_en: 'In Progress', color: '#4FC3F7' },
  { value: '待客户回复', label_zh: '待客户回复', label_en: 'Awaiting Customer', color: '#FFB74D' },
  { value: '已解决', label_zh: '已解决', label_en: 'Resolved', color: '#81C784' },
  { value: '待出库', label_zh: '待出库', label_en: 'Pending Outbound', color: '#FFB74D' },
  { value: '出库中', label_zh: '出库中', label_en: 'Processing Outbound', color: '#4FC3F7' },
  { value: '待发货', label_zh: '待发货', label_en: 'Pending Shipment', color: '#7986CB' },
  { value: '已发货', label_zh: '已发货', label_en: 'Shipped', color: '#81C784' },
];

export const DEFAULT_TICKET_TYPES = [
  { value: '投诉', label_zh: '投诉', label_en: 'Complaint' },
  { value: '退货', label_zh: '退货', label_en: 'Return' },
  { value: '物流异常', label_zh: '物流异常', label_en: 'Logistics Issue' },
  { value: '咨询', label_zh: '咨询', label_en: 'Inquiry' },
];

export const DEFAULT_PO_STATUSES = [
  { value: '草稿', label_zh: '草稿', label_en: 'Draft', color: '#9E9E9E' },
  { value: '待供应商确认', label_zh: '待供应商确认', label_en: 'Awaiting Supplier', color: '#FFB74D' },
  { value: '生产中', label_zh: '生产中', label_en: 'In Production', color: '#4FC3F7' },
  { value: '已发货', label_zh: '已发货', label_en: 'Shipped', color: '#7986CB' },
  { value: '已收货', label_zh: '已收货', label_en: 'Received', color: '#81C784' },
  { value: '已取消', label_zh: '已取消', label_en: 'Cancelled', color: '#E57373' },
];

export const DEFAULT_STOCK_STATUSES = [
  { value: 'normal', label_zh: '库存正常', label_en: 'Normal' },
  { value: 'low', label_zh: '库存偏低', label_en: 'Low Stock' },
  { value: 'out', label_zh: '缺货', label_en: 'Out of Stock' },
];

export const DEFAULT_SETTLEMENT_STATUSES = [
  { value: '未结算', label_zh: '未结算', label_en: 'Unsettled' },
  { value: '部分结算', label_zh: '部分结算', label_en: 'Partial' },
  { value: '已结算', label_zh: '已结算', label_en: 'Settled' },
];

const DEFAULT_SETTINGS = {
  visible_fields: {
    platform: true,
    customer_contact: true,
    tracking_number: true,
    attachments: true,
    due_date: true,
  },
  status_labels: {
    pending: '待处理',
    in_progress: '处理中',
    waiting_customer: '待客户回复',
    resolved: '已解决',
  },
  priority_levels: ['普通', '紧急'],
  logo_url: '',
  operation_fee_rate: 5,
  ticket_statuses: DEFAULT_TICKET_STATUSES,
  ticket_types: DEFAULT_TICKET_TYPES,
  po_statuses: DEFAULT_PO_STATUSES,
  stock_statuses: DEFAULT_STOCK_STATUSES,
  settlement_statuses: DEFAULT_SETTLEMENT_STATUSES,
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsId, setSettingsId] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const list = await base44.entities.ModuleSettings.list();
    if (list.length > 0) {
      const s = list[0];
      setSettingsId(s.id);
      setSettings({
        visible_fields: { ...DEFAULT_SETTINGS.visible_fields, ...s.visible_fields },
        status_labels: { ...DEFAULT_SETTINGS.status_labels, ...s.status_labels },
        priority_levels: s.priority_levels?.length ? s.priority_levels : DEFAULT_SETTINGS.priority_levels,
        logo_url: s.logo_url || '',
        operation_fee_rate: s.operation_fee_rate ?? DEFAULT_SETTINGS.operation_fee_rate,
        ticket_statuses: s.ticket_statuses?.length ? s.ticket_statuses : DEFAULT_TICKET_STATUSES,
        ticket_types: s.ticket_types?.length ? s.ticket_types : DEFAULT_TICKET_TYPES,
        po_statuses: s.po_statuses?.length ? s.po_statuses : DEFAULT_PO_STATUSES,
        stock_statuses: s.stock_statuses?.length ? s.stock_statuses : DEFAULT_STOCK_STATUSES,
        settlement_statuses: s.settlement_statuses?.length ? s.settlement_statuses : DEFAULT_SETTLEMENT_STATUSES,
      });
    }
  }

  async function updateSettings(newSettings) {
    setSettings(newSettings);
    if (settingsId) {
      await base44.entities.ModuleSettings.update(settingsId, newSettings);
    } else {
      const created = await base44.entities.ModuleSettings.create(newSettings);
      setSettingsId(created.id);
    }
  }

  // Legacy compat
  const statusMap = settings.status_labels;
  const statusList = settings.ticket_statuses?.map(s => s.label_zh) ||
    [statusMap.pending, statusMap.in_progress, statusMap.waiting_customer, statusMap.resolved];

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, statusMap, statusList }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}