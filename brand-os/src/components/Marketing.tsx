import { useStore } from '../store'
import { Badge, Button, Card, SectionTitle, Stat } from './ui'

export function Marketing() {
  const { state, dispatch } = useStore()
  const totalSpend = state.campaigns.reduce((s, c) => s + c.spend30d, 0)
  const totalRevenue = state.campaigns.reduce((s, c) => s + c.revenue30d, 0)
  const blendedRoas = totalRevenue / totalSpend

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle sub="Spend from Meta/Google APIs joined against Shopify revenue and Finance's COGS — true ROAS, not platform-reported.">
          Performance (30 days)
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ad spend" value={`$${totalSpend.toLocaleString()}`} sub="auto-posted to journal" />
          <Stat label="Attributed revenue" value={`$${totalRevenue.toLocaleString()}`} />
          <Stat label="Blended ROAS" value={`${blendedRoas.toFixed(1)}x`} tone={blendedRoas >= 2.5 ? 'text-emerald-600' : 'text-amber-600'} />
          <Stat label="Active campaigns" value={`${state.campaigns.filter((c) => c.status === 'active').length}/${state.campaigns.length}`} />
        </div>
      </div>

      <div>
        <SectionTitle sub="The OOS ad guard subscribes to Inventory stock events — campaigns pointing at out-of-stock SKUs pause automatically; resuming requires your approval (it's a spend change).">
          Campaigns
        </SectionTitle>
        <div className="space-y-2.5">
          {state.campaigns.map((c) => {
            const roas = c.revenue30d / c.spend30d
            const sku = c.linkedSku ? state.products.find((p) => p.sku === c.linkedSku) : null
            const canResume = c.status === 'paused_oos' && sku && sku.stock > 0
            return (
              <Card key={c.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{c.name}</span>
                  <Badge tone="slate">{c.platform}</Badge>
                  {c.status === 'active' && <Badge tone="emerald">active</Badge>}
                  {c.status === 'paused_oos' && <Badge tone="rose">✦ paused by OOS guard</Badge>}
                  {c.status === 'paused_manual' && <Badge tone="slate">paused</Badge>}
                  {c.linkedSku && (
                    <Badge tone={sku && sku.stock > 0 ? 'sky' : 'rose'}>
                      → {c.linkedSku} ({sku?.stock ?? '?'} in stock)
                    </Badge>
                  )}
                  <span className="ml-auto" />
                  {canResume && (
                    <Button variant="secondary" onClick={() => dispatch({ type: 'RESUME_CAMPAIGN', campaignId: c.id })}>
                      Approve resume
                    </Button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-6 text-sm">
                  <span className="text-slate-500">Budget <span className="font-medium text-slate-800">${c.dailyBudget}/day</span></span>
                  <span className="text-slate-500">Spend 30d <span className="font-medium text-slate-800">${c.spend30d.toLocaleString()}</span></span>
                  <span className="text-slate-500">Revenue 30d <span className="font-medium text-slate-800">${c.revenue30d.toLocaleString()}</span></span>
                  <span className="text-slate-500">ROAS <span className={`font-medium ${roas >= 2.5 ? 'text-emerald-600' : 'text-amber-600'}`}>{roas.toFixed(1)}x</span></span>
                </div>
                {c.status === 'paused_oos' && !canResume && (
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    Held until {c.linkedSku} is restocked — AI will surface a resume approval in the digest the moment stock lands.
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      <Card className="border-dashed p-5 text-sm text-slate-500">
        <div className="font-medium text-slate-600">AI suggestion layer — Phase 2.5 (deliberately not built yet)</div>
        <p className="mt-1">
          Ad copy variants, budget reallocation, and SEO gap suggestions ship only after the spend/revenue/stock data
          pipes above are validated with real data. Recommendations built on stub data erode trust fast — per the spec,
          the pipes come first.
        </p>
      </Card>
    </div>
  )
}
