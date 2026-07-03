-- Allow admins to rename non-system accounts (chart of accounts configuration).

create policy accounts_update on app.accounts
  for update
  using (app.has_role(tenant_id, 'admin') and not is_system)
  with check (app.has_role(tenant_id, 'admin') and not is_system);
