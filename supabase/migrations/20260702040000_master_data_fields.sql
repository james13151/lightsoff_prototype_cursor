-- ============================================================================
-- LightsOff — Master data field enrichment
-- ============================================================================

alter table app.vendors
  add column if not exists payment_terms text,
  add column if not exists is_recurring boolean not null default true;

alter table app.warehouses
  add column if not exists contact_name  text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

-- Structured address lives in warehouses.address jsonb:
-- { line1, line2, city, state, postal_code, country }
