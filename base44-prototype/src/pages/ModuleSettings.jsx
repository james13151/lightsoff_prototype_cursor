import React, { useState, useEffect } from 'react';
import { useSettings, DEFAULT_TICKET_STATUSES, DEFAULT_TICKET_TYPES, DEFAULT_PO_STATUSES, DEFAULT_STOCK_STATUSES, DEFAULT_SETTLEMENT_STATUSES } from '@/lib/settingsContext';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18nContext';
import UserManagementPage from './UserManagementPage';
import StatusLabelsEditor from '@/components/settings/StatusLabelsEditor';
import PlannerSettings from './planner/PlannerSettings';
import { useQuery } from '@tanstack/react-query';

const FIELD_LABELS = {
  platform: '来源平台',
  customer_contact: '联系方式',
  tracking_number: '追踪号',
  attachments: '附件',
  due_date: '截止日期',
};

// PO statuses that are core and cannot be deleted
const LOCKED_PO_VALUES = ['草稿', '已收货', '已取消'];

export default function ModuleSettings({ currentUser }) {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const [localSettings, setLocalSettings] = useState(settings);
  const [newPriority, setNewPriority] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Fetch tickets to detect which statuses/types are in use
  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => base44.entities.Ticket.list('-updated_date', 500),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const usedTicketStatuses = [...new Set(tickets.map(tk => tk.status).filter(Boolean))];
  const usedTicketTypes = [...new Set(tickets.map(tk => tk.ticket_type).filter(Boolean))];

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const updated = { ...localSettings, logo_url: file_url };
    setLocalSettings(updated);
    await updateSettings(updated);
    toast.success('Logo 已更新');
    setUploadingLogo(false);
  };

  const handleRemoveLogo = async () => {
    const updated = { ...localSettings, logo_url: '' };
    setLocalSettings(updated);
    await updateSettings(updated);
    toast.success('Logo 已移除');
  };

  const toggleField = (field) => {
    setLocalSettings(s => ({
      ...s,
      visible_fields: { ...s.visible_fields, [field]: !s.visible_fields[field] },
    }));
  };

  const addPriority = () => {
    if (!newPriority.trim()) return;
    if (localSettings.priority_levels.includes(newPriority.trim())) return;
    setLocalSettings(s => ({ ...s, priority_levels: [...s.priority_levels, newPriority.trim()] }));
    setNewPriority('');
  };

  const removePriority = (p) => {
    if (localSettings.priority_levels.length <= 1) return;
    setLocalSettings(s => ({ ...s, priority_levels: s.priority_levels.filter(x => x !== p) }));
  };

  const handleSave = async () => {
    await updateSettings(localSettings);
    toast.success('设置已保存');
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-3xl mx-auto py-8 px-6">
        <h2 className="text-[18px] font-semibold text-foreground mb-1">{t('settings_title')}</h2>
        <p className="text-[12px] text-muted-foreground mb-6">{t('settings_subtitle')}</p>

        <Tabs defaultValue="module">
          <TabsList className="mb-6 bg-muted/30 border border-thin border-border">
            <TabsTrigger value="module" className="text-[12px]">模块设置</TabsTrigger>
            <TabsTrigger value="statuses" className="text-[12px]">状态标签</TabsTrigger>
            <TabsTrigger value="planner" className="text-[12px]">项目计划</TabsTrigger>
          <TabsTrigger value="users" className="text-[12px]">{t('nav_user_mgmt')}</TabsTrigger>
          </TabsList>

          {/* ── 项目计划设置 ── */}
          <TabsContent value="planner">
            <PlannerSettings />
          </TabsContent>

          {/* ── 用户管理 ── */}
          <TabsContent value="users" className="-mx-6">
            <UserManagementPage />
          </TabsContent>

          {/* ── 模块设置 ── */}
          <TabsContent value="module">
            {/* Logo */}
            <section className="mb-8">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">品牌 Logo</h3>
              <div className="flex items-center gap-4">
                <div className="w-[60px] h-[60px] rounded-xl border border-thin border-border flex items-center justify-center overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {localSettings.logo_url ? (
                    <img src={localSettings.logo_url} alt="logo" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[22px] font-bold" style={{ color: '#D4AF37' }}>工</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="cursor-pointer">
                    <input type="file" accept="image/png,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden" />
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground border border-thin border-border rounded-lg px-3 py-1.5 hover:bg-white/[0.05] transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingLogo ? '上传中...' : '上传 Logo'}
                    </span>
                  </label>
                  {localSettings.logo_url && (
                    <button onClick={handleRemoveLogo} className="text-[11px] text-muted-foreground hover:text-destructive text-left transition-colors">
                      移除 Logo
                    </button>
                  )}
                  <p className="text-[10px] text-muted-foreground/50">推荐 PNG 透明背景，或 SVG 格式</p>
                </div>
              </div>
            </section>

            {/* Visible fields */}
            <section className="mb-8">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">可选字段显示</h3>
              <div className="space-y-3">
                {Object.entries(FIELD_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between py-2 px-3 rounded-lg border border-thin border-border">
                    <span className="text-[13px] text-foreground">{label}</span>
                    <Switch checked={localSettings.visible_fields[key]} onCheckedChange={() => toggleField(key)} />
                  </div>
                ))}
              </div>
            </section>

            {/* Priority levels */}
            <section className="mb-8">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">优先级</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {localSettings.priority_levels.map(p => (
                  <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-thin border-border text-[12px] text-foreground">
                    {p}
                    {localSettings.priority_levels.length > 1 && (
                      <button onClick={() => removePriority(p)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newPriority}
                  onChange={e => setNewPriority(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPriority()}
                  placeholder="添加优先级..."
                  className="h-8 text-[13px] border-thin rounded-lg flex-1"
                />
                <Button size="sm" variant="outline" onClick={addPriority} className="h-8 text-[12px] border-thin">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </section>

            {/* Operation fee rate */}
            <section className="mb-8">
              <h3 className="text-[13px] font-semibold text-foreground mb-1">美国仓操作费费率</h3>
              <p className="text-[11px] text-muted-foreground mb-3">每笔出库操作费用（Partner出库时自动记录）</p>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-muted-foreground">¥</span>
                <Input
                  type="number"
                  value={localSettings.operation_fee_rate ?? 5}
                  onChange={e => setLocalSettings(s => ({ ...s, operation_fee_rate: Number(e.target.value) }))}
                  className="h-8 text-[13px] border-thin rounded-lg w-32"
                  min="0"
                  step="0.5"
                />
                <span className="text-[12px] text-muted-foreground">/ 单</span>
              </div>
            </section>

            <Button onClick={handleSave} className="h-9 text-[13px] w-full">保存设置</Button>
          </TabsContent>

          {/* ── 状态标签 ── */}
          <TabsContent value="statuses">
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground mb-6">修改后点击底部「保存」按钮生效。删除图标灰显表示该状态正在使用中，无法删除。</p>

              {/* 1. 工单状态 */}
              <StatusLabelsEditor
                title="1. 工单状态 (Ticket Status)"
                description="不能删除当前有工单使用的状态"
                items={localSettings.ticket_statuses || DEFAULT_TICKET_STATUSES}
                onChange={v => setLocalSettings(s => ({ ...s, ticket_statuses: v }))}
                showColor={true}
                showBilingual={true}
                canAdd={true}
                usedValues={usedTicketStatuses}
              />

              {/* 2. 工单类型 */}
              <StatusLabelsEditor
                title="2. 工单类型 (Ticket Type)"
                items={localSettings.ticket_types || DEFAULT_TICKET_TYPES}
                onChange={v => setLocalSettings(s => ({ ...s, ticket_types: v }))}
                showColor={false}
                showBilingual={true}
                canAdd={true}
                usedValues={usedTicketTypes}
              />

              {/* 3. 采购订单状态 */}
              <StatusLabelsEditor
                title="3. 采购订单状态 (PO Status)"
                description="草稿 / 已收货 / 已取消 为系统核心状态，不可删除"
                items={localSettings.po_statuses || DEFAULT_PO_STATUSES}
                onChange={v => setLocalSettings(s => ({ ...s, po_statuses: v }))}
                showColor={true}
                showBilingual={true}
                canAdd={false}
                lockedValues={LOCKED_PO_VALUES}
              />

              {/* 4. 库存状态 */}
              <StatusLabelsEditor
                title="4. 库存状态 (Stock Status)"
                description="仅支持重命名，逻辑保持不变"
                items={localSettings.stock_statuses || DEFAULT_STOCK_STATUSES}
                onChange={v => setLocalSettings(s => ({ ...s, stock_statuses: v }))}
                showColor={false}
                showBilingual={true}
                canAdd={false}
                lockedValues={['normal', 'low', 'out']}
              />

              {/* 5. 结算状态 */}
              <StatusLabelsEditor
                title="5. 结算状态 (Settlement Status)"
                description="仅支持重命名"
                items={localSettings.settlement_statuses || DEFAULT_SETTLEMENT_STATUSES}
                onChange={v => setLocalSettings(s => ({ ...s, settlement_statuses: v }))}
                showColor={false}
                showBilingual={true}
                canAdd={false}
                lockedValues={['未结算', '部分结算', '已结算']}
              />

              <Button onClick={handleSave} className="h-9 text-[13px] w-full mt-6">保存设置</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}