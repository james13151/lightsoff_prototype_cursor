#!/usr/bin/env bash
# End-to-end exercise of the Phase 1 spine through the API.
set -euo pipefail
cd /workspace/api
export JWT_SECRET=local-test-jwt-secret
BASE=http://localhost:3001
ALICE=$(node scripts/dev-token.mjs 11111111-1111-1111-1111-111111111111)
AUTH="Authorization: Bearer $ALICE"
JSON="content-type: application/json"

step() { echo; echo "== $1"; }

step "create tenant"
curl -sf -X POST $BASE/v1/tenants -H "$AUTH" -H "$JSON" -d '{"name":"Spine Co"}' > /dev/null
TENANT=$(curl -sf $BASE/v1/tenants -H "$AUTH" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')
echo "tenant=$TENANT"

step "chart of accounts auto-seeded"
curl -sf "$BASE/v1/accounts?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys
accts = json.load(sys.stdin)
assert len(accts) >= 10, f"expected seeded accounts, got {len(accts)}"
print(f"{len(accts)} accounts, e.g.", ", ".join(a["code"]+" "+a["name"] for a in accts[:3]))'

step "create vendor + product/variant"
VENDOR=$(curl -sf -X POST $BASE/v1/vendors -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"name\":\"Acme Textiles\",\"lead_time_days\":12}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
VARIANT=$(curl -sf -X POST $BASE/v1/products -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"title\":\"Blue Hoodie\",\"variants\":[{\"sku\":\"HOOD-BLU-M\",\"price\":68,\"unit_cost\":18.5,\"reorder_point\":20}]}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["variants"][0]["id"])')
echo "vendor=$VENDOR variant=$VARIANT"

step "create PO (100 units) and send it"
PO=$(curl -sf -X POST $BASE/v1/purchase-orders -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"vendor_id\":\"$VENDOR\",\"source\":\"ai_capture\",\"lines\":[{\"variant_id\":\"$VARIANT\",\"qty\":100,\"unit_cost\":18.5}]}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -sf -X POST $BASE/v1/purchase-orders/$PO/send -H "$AUTH" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["status"]=="sent"; print("PO sent")'

POLINE=$(curl -sf "$BASE/v1/purchase-orders?tenant_id=$TENANT" -H "$AUTH" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["lines"][0]["id"])')

step "receive 97 of 100 -> stock 97, discrepancy flagged, PO partially_received"
curl -sf -X POST $BASE/v1/receipts -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"vendor_id\":\"$VENDOR\",\"po_id\":\"$PO\",\"lines\":[{\"po_line_item_id\":\"$POLINE\",\"variant_id\":\"$VARIANT\",\"qty\":97}]}" \
  | python3 -c '
import json,sys
r = json.load(sys.stdin)
assert len(r["discrepancies"]) == 1 and r["discrepancies"][0]["kind"] == "shortfall", r
print("discrepancy:", r["discrepancies"][0]["kind"], r["discrepancies"][0]["received_total"], "/", r["discrepancies"][0]["ordered"])'
curl -sf "$BASE/v1/stock?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys
s = json.load(sys.stdin)[0]
assert s["on_hand"] == 97, s
print("stock:", s["sku"], s["on_hand"], "below_reorder_point:", s["below_reorder_point"])'
curl -sf "$BASE/v1/purchase-orders?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys
po = json.load(sys.stdin)[0]
assert po["status"] == "partially_received", po["status"]
print("PO status:", po["status"])'

step "sample receipt (no variant) -> stock unchanged"
curl -sf -X POST $BASE/v1/receipts -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"vendor_id\":\"$VENDOR\",\"type\":\"sample\",\"lines\":[{\"description\":\"Corduroy swatch\",\"qty\":2}]}" > /dev/null
curl -sf "$BASE/v1/stock?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys; s = json.load(sys.stdin)[0]; assert s["on_hand"] == 97, s; print("stock still:", s["on_hand"])'

curl -sf "$BASE/v1/stock?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys; s = json.load(sys.stdin)[0]; assert s["on_hand"] == 97, s; print("stock still:", s["on_hand"])'

step "manual inventory adjustment -> stock 95"
curl -sf -X POST $BASE/v1/inventory-adjustments -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"variant_id\":\"$VARIANT\",\"qty_delta\":-2,\"memo\":\"cycle count\"}" > /dev/null
curl -sf "$BASE/v1/stock?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys
s = json.load(sys.stdin)[0]
assert s["on_hand"] == 95, s
print("stock after adjustment:", s["on_hand"])'

step "create bill 1850 -> journal auto-posts, AP = 1850"
BILL=$(curl -sf -X POST $BASE/v1/bills -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"vendor_id\":\"$VENDOR\",\"po_id\":\"$PO\",\"amount\":1850,\"bill_number\":\"INV-100\",\"due_date\":\"2026-07-16\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -sf "$BASE/v1/finance/summary?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys
s = json.load(sys.stdin)
assert float(s["accounts_payable"]) == 1850, s
print("AP:", s["accounts_payable"], "cash:", s["cash"])'

step "pay bill in two installments -> partially_paid then paid; cash -1850"
curl -sf -X POST $BASE/v1/payments -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"vendor_id\":\"$VENDOR\",\"amount\":1000,\"allocations\":[{\"bill_id\":\"$BILL\",\"amount\":1000}]}" > /dev/null
curl -sf "$BASE/v1/bills?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys; b = json.load(sys.stdin)[0]; assert b["status"] == "partially_paid", b["status"]; print("bill:", b["status"], "paid:", b["amount_paid"])'
curl -sf -X POST $BASE/v1/payments -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"vendor_id\":\"$VENDOR\",\"amount\":850,\"allocations\":[{\"bill_id\":\"$BILL\",\"amount\":850}]}" > /dev/null
curl -sf "$BASE/v1/bills?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys; b = json.load(sys.stdin)[0]; assert b["status"] == "paid", b["status"]; print("bill:", b["status"])'
curl -sf "$BASE/v1/finance/summary?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys
s = json.load(sys.stdin)
assert float(s["cash"]) == -1850 and float(s["accounts_payable"]) == 0, s
print("cash:", s["cash"], "AP:", s["accounts_payable"])'

step "over-allocation rejected"
CODE=$(curl -s -o /tmp/overalloc.json -w "%{http_code}" -X POST $BASE/v1/payments -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"vendor_id\":\"$VENDOR\",\"amount\":500,\"allocations\":[{\"bill_id\":\"$BILL\",\"amount\":500}]}")
[ "$CODE" = "400" ] && echo "rejected 400: $(python3 -c 'import json; print(json.load(open("/tmp/overalloc.json"))["error"])')" || { echo "FAIL: expected 400 got $CODE"; exit 1; }

step "unbalanced manual journal entry rejected"
CODE=$(curl -s -o /tmp/unbal.json -w "%{http_code}" -X POST $BASE/v1/journal -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"memo\":\"bad\",\"lines\":[{\"account_code\":\"1000\",\"debit\":100},{\"account_code\":\"4000\",\"credit\":99}]}")
[ "$CODE" = "400" ] && echo "rejected 400" || { echo "FAIL: expected 400 got $CODE"; exit 1; }

step "expense claim: submit (member) -> approve (owner) -> journal + petty cash"
CLAIM=$(curl -sf -X POST $BASE/v1/expense-claims -H "$AUTH" -H "$JSON" \
  -d "{\"tenant_id\":\"$TENANT\",\"vendor_name\":\"Uber Freight\",\"amount\":74.20,\"category_account_code\":\"6100\",\"confidence\":0.72,\"source\":\"ai_capture\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -sf -X POST $BASE/v1/expense-claims/$CLAIM/approve -H "$AUTH" > /dev/null
curl -sf "$BASE/v1/expense-claims?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys; c = json.load(sys.stdin)[0]; assert c["status"] == "approved", c["status"]; print("claim:", c["status"])'
curl -sf "$BASE/v1/finance/summary?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys
s = json.load(sys.stdin)
assert float(s["petty_cash"]) == -74.20, s
print("petty cash:", s["petty_cash"], "expenses:", s["expenses"])'

step "event bus recorded the whole story"
curl -sf "$BASE/v1/events?tenant_id=$TENANT" -H "$AUTH" | python3 -c '
import json,sys
types = [e["type"] for e in json.load(sys.stdin)]
for expected in ["vendor.created","po.created","po.sent","inventory.received","inventory.discrepancy_flagged",
                 "inventory.adjusted","po.partially_received","bill.created","journal.posted","payment.recorded","bill.paid",
                 "claim.submitted","claim.approved"]:
    assert expected in types, f"missing event {expected}: {types}"
print(len(types), "events, all expected types present")'

step "cross-tenant: bob sees nothing, cannot pay bills"
BOB=$(node scripts/dev-token.mjs 22222222-2222-2222-2222-222222222222)
COUNT=$(curl -sf "$BASE/v1/bills?tenant_id=$TENANT" -H "Authorization: Bearer $BOB" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
[ "$COUNT" = "0" ] && echo "bob sees 0 bills" || { echo "FAIL: bob sees $COUNT bills"; exit 1; }

echo; echo "ALL SPINE E2E CHECKS PASSED"
