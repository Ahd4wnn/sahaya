# Billing — Razorpay Subscriptions

Two plans, both ₹99/month (`amount_paise = 9900`), auto-renewing via a real mandate.

| Plan code | Who | What it unlocks |
|---|---|---|
| `helper_monthly` | Helper | `is_listed` stays true — the profile appears in browse |
| `hirer_monthly` | Hirer | Contact reveal, chat, unlimited hire requests |

**Browse and profile previews are free for everyone.** Nobody pays before seeing real inventory.
This is the only reason a both-sides paywall can survive its cold start.

## Flow

```
1. POST /api/v1/billing/subscribe { plan_code }
     backend → razorpay.subscription.create({ plan_id, total_count, customer_notify })
     ← razorpay_subscription_id, row written with status 'created'

2. Frontend opens Razorpay Checkout with that subscription_id
     user authorises the mandate — UPI Autopay / e-NACH / card

3. Checkout callback → POST /billing/confirm
     marks the row 'pending'.  NOT trusted as truth.

4. POST /webhooks/razorpay          ← the actual source of truth
     signature verified → event deduped → status transitioned
```

Step 3 exists only to give the user immediate feedback. A client callback can be spoofed,
dropped, or fired from a tab that closes. **Access is granted by step 4 and nothing else.**

## Webhook handling — the two things that break this

### 1. Read the raw body first

```python
raw = await request.body()          # BEFORE any parsing
client.utility.verify_webhook_signature(
    raw.decode(), request.headers["x-razorpay-signature"], settings.RAZORPAY_WEBHOOK_SECRET
)
```

Razorpay computes HMAC-SHA256 over the **exact bytes sent**. Letting FastAPI parse the JSON and
then re-serialising it changes key order and whitespace, the signature no longer matches, and
every webhook fails with a signature error that looks like a credentials problem. This is the
single most common way this integration fails.

### 2. The unique constraint is the idempotency

```sql
INSERT INTO webhook_events (razorpay_event_id, ...) VALUES (...)
```

Razorpay retries on any non-2xx, and can deliver the same event twice even on success. The insert
either succeeds (first delivery — process it) or violates `UNIQUE(razorpay_event_id)` (already
handled — return 200 and stop).

No separate "have I seen this?" lookup, so **no race window** between two concurrent deliveries.

## Events handled

| Event | Effect |
|---|---|
| `subscription.activated` | → `active`, set `current_start` / `current_end`. Access begins. |
| `subscription.charged` | Renewal — write a `payments` row, extend `current_end` |
| `subscription.pending` | Payment failed, Razorpay will retry. Access **continues** for now |
| `subscription.halted` | Retries exhausted → access ends, helper delisted |
| `subscription.cancelled` | User cancelled → access runs to `current_end`, then ends |
| `subscription.completed` | `total_count` reached |

`pending` deliberately does not cut access. A UPI mandate can fail for a day because a bank is
down; delisting a helper over that would cost them work through no fault of their own.

## The access check

One dependency, used everywhere:

```python
status IN ('active', 'authenticated') AND current_end > now()
```

`authenticated` is included because Razorpay sets it once the mandate is approved but before the
first successful charge settles. Excluding it leaves a paying user locked out for a day.

## Failure states the UI must handle

- `halted` → banner: mandate failed, with a re-subscribe action
- `cancelled` with `current_end` in the future → "active until 14 March"
- Helper whose subscription lapses → profile hidden, but **all data preserved**. Re-subscribing
  restores the profile intact, ratings and history included. Nothing is deleted.

## Test mode

Razorpay test keys in `backend/.env`. Test-mode UPI Autopay can be driven all the way to
`subscription.activated`. Local webhook delivery needs a tunnel; captured payloads are replayed
against the endpoint in tests instead, which is faster and works offline.

**Recurring payments require Razorpay approval on the live account.** Test mode works
immediately; the live switch needs that approval in place, and it is worth requesting early.
