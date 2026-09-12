# Data Model

PostgreSQL 18. SQLAlchemy 2.0 async models in `backend/app/models/`, Alembic migrations.

**Conventions**
- Primary keys are UUIDv7 (`uuid` column type) — time-sortable, so they index well and do not
  leak row counts the way sequential integers do.
- Every table has `created_at` and `updated_at` (`timestamptz`, UTC).
- Money is stored in **paise as `integer`**. Never floats. `9900` is ₹99.00.
- Enums are PostgreSQL native enum types, mirrored as Python `StrEnum`.

---

## Identity

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | citext NULL UNIQUE | nullable — phone-only users are normal |
| `phone` | text NULL UNIQUE | E.164, `+91…` |
| `full_name` | text | |
| `role` | enum `admin\|helper\|hirer` | |
| `email_verified_at` | timestamptz NULL | |
| `phone_verified_at` | timestamptz NULL | |
| `status` | enum `active\|suspended\|deleted` | |
| `last_seen_at` | timestamptz NULL | |

Both `email` and `phone` are nullable but at least one must be present —
enforced by a `CHECK (email IS NOT NULL OR phone IS NOT NULL)`.

### `auth_identities`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | ON DELETE CASCADE |
| `provider` | enum `google\|apple\|email\|phone` | |
| `provider_subject` | text | Google `sub`, Apple `sub`, or the phone/email itself |

`UNIQUE (provider, provider_subject)`

**This table is the reason one person is one user.** Somebody who signs up with a phone OTP in
March and then taps "Continue with Google" in June gets two rows here and one row in `users` —
matched on verified email or verified phone. Without it we would silently create duplicate
accounts, split their hire history, and lose their rating.

### `refresh_tokens`
`id`, `user_id` FK, `token_hash` (sha256 — **never the raw token**), `device` text,
`expires_at`, `revoked_at` NULL, `replaced_by` uuid NULL.

Rotation: each refresh mints a new token and sets `replaced_by` on the old one. If a token that
is already `replaced_by` something gets presented, that is replay — revoke the whole chain.

### `otp_codes`
`id`, `target` text (phone or email), `channel` enum `sms|email`, `code_hash`,
`purpose` enum `login|verify_email|verify_phone`, `attempts` int default 0,
`expires_at`, `consumed_at` NULL.

Codes are 6 digits, valid 10 minutes, max 5 attempts. Index on `(target, purpose)`.

---

## Kerala geography

### `districts`
`id`, `slug`, `name`, `name_ml` (Malayalam). Exactly 14 rows. See `09-kerala-data.md`.

### `towns`
`id`, `district_id` FK, `name`, `name_ml`, `is_major` bool.

Browse filters cascade district → town. A free-text `landmark` on the helper profile covers
finer detail, so we never need an exhaustive gazetteer to launch.

---

## Taxonomy

Served to all three clients from `GET /api/v1/taxonomy` so the lists cannot drift.

Both tables are **admin-managed** after seeding (Admin → Categories, Admin → Skills): renamed,
reordered and archived from the panel, never deleted, with immutable slugs because slugs travel
in shared links. The seed is insert-only for both, so a re-run cannot undo an admin's edit.
See DECISIONS.md 018 and 022.

### `services` — the **primary role**, shown under the name on the card
`maid`, `cook`, `home_nurse`, `elder_care`, `child_care`, `driver`, `gardener`
Columns: `id`, `slug`, `name`, `name_ml`, `icon`, `sort_order`, `is_active`, `show_in_nav`,
`nav_label`.

### `skills` — the **chips** on the card
`cooking`, `cleaning`, `laundry`, `ironing`, `elder_care`, `baby_care`, `patient_care`,
`pet_care`, `gardening`, `driving`, `errands`
Columns: `id`, `slug`, `name`, `name_ml`, `sort_order`, `is_active`.

`is_active` is read in exactly one place, `GET /taxonomy`, so every surface that lists services
or skills agrees about which exist. An archived row keeps the helpers already in or tagged with
it; it simply stops being choosable.

A helper has **one** service and **many** skills. This mirrors the reference card exactly:
one role line under the name, then a scrollable row of specialty chips.

---

## Marketplace

### `helper_profiles`
| Column | Type | Notes |
|---|---|---|
| `id` / `user_id` | uuid PK / FK UNIQUE | one profile per user |
| `service_id` | FK → services | the primary role |
| `headline`, `bio` | text | |
| `experience_years` | int | |
| `wage_monthly_min` | int | **paise** |
| `wage_monthly_max` | int | **paise**, `CHECK (max >= min)` |
| `shifts` | enum[] `morning\|afternoon\|evening\|full_day` | |
| `hours_per_day` | int | `CHECK (1..16)` |
| `willing_to_live_in` | bool | primary filter — live-in work is common in Kerala |
| `languages` | text[] | |
| `district_id` / `town_id` | FK | |
| `landmark` | text NULL | |
| `photo_key` | text NULL | original upload |
| `photo_cutout_key` | text NULL | transparent PNG |
| `cutout_status` | enum `pending\|done\|failed` | |
| `id_verification_status` | enum `none\|pending\|verified\|rejected` | |
| `police_verification_status` | enum `none\|pending\|verified\|rejected` | |
| `is_listed` | bool | driven by subscription state |
| `rating_avg` | numeric(2,1) NULL | |
| `rating_count` | int default 0 | |

**There is no `wage_daily` or `wage_hourly` column.** Monthly is the only rate this product
supports, and the schema is where that is enforced.

Both `photo_key` and `photo_cutout_key` are kept. A `failed` cutout is a *render* decision —
the card falls back to a circular crop — not data loss, and it never blocks listing.

Indexes: `(district_id, town_id)`, `(service_id)`, `(is_listed)`,
`(wage_monthly_min, wage_monthly_max)`, GIN on `shifts`.

### `helper_skills`
`helper_profile_id` FK, `skill_id` FK. Composite PK. Drives the chips and the skill filter.

### `hirer_profiles`
`id`, `user_id` FK UNIQUE, `household_size` int NULL, `district_id`, `town_id`,
**`rating_avg`, `rating_count`** — hirers carry a public rating too.

### `hire_requests`
`id`, `hirer_id` FK, `helper_id` FK, `message` text,
`status` enum `pending|accepted|declined|withdrawn|completed`.
`UNIQUE (hirer_id, helper_id)` on open requests, so a hirer cannot spam the same helper.

### `reviews`
`id`, `hire_request_id` FK, `rater_id`, `ratee_id`,
`direction` enum `hirer_to_helper|helper_to_hirer`, `rating` int `CHECK (1..5)`, `comment` text.

`UNIQUE (hire_request_id, direction)` — **each side reviews once per engagement**, and only
once the request reaches `completed`. Writing a review recomputes the ratee's
`rating_avg`/`rating_count` in the same transaction.

### `documents`
`id`, `user_id` FK, `kind` enum `id_proof|address_proof|police_verification|photo`,
`storage_key`, `status` enum `pending|approved|rejected`, `reviewed_by` FK NULL,
`review_note` text NULL. This is the admin verification queue.

---

## Billing

See `05-billing-razorpay.md` for the flow.

### `plans`
`id`, `code` enum `helper_monthly|hirer_monthly` UNIQUE, `razorpay_plan_id`,
`amount_paise` (9900), `interval` (`monthly`), `is_active`.

### `subscriptions`
`id`, `user_id` FK, `plan_id` FK, `razorpay_subscription_id` UNIQUE,
`status` enum `created|authenticated|active|pending|halted|cancelled|completed|expired`,
`current_start`, `current_end`, `charge_at`, `cancelled_at`.

Access check: `status IN ('active','authenticated') AND current_end > now()`.

### `payments`
`id`, `subscription_id` FK, `razorpay_payment_id` UNIQUE, `razorpay_invoice_id`,
`amount_paise`, `status`, `method`, `captured_at`.

### `webhook_events`
`id`, `razorpay_event_id` **UNIQUE**, `event_type`, `payload` jsonb, `processed_at`.

**That unique constraint is the idempotency guarantee.** Razorpay retries; the insert either
succeeds (first delivery, process it) or violates the constraint (already handled, return 200).
No separate dedupe logic, no race window.

## Chat, alerts and the assistant

### `conversations`
One thread between exactly two people. `participant_a_id` and `participant_b_id` are stored
lowest-id-first, with `UNIQUE (a, b)` and `CHECK (a < b)`: two people can never end up with two
threads, however fast two taps race. Read state is `a_last_read_at` / `b_last_read_at` rather than
a receipts table — the only question the UI asks is "how many are unread for me".

### `messages`
`conversation_id`, `sender_id` (nullable, `ON DELETE SET NULL`, so removing an account does not
delete what the other person was told), `body`.

### `notifications`
One rendered message for one user: `kind` (a plain string, so a new type needs no migration),
`title`, `body`, `link`, `read_at`. Deliberately **not** in `messages`: the chat page renders them
as the pinned "Sahaya" thread, which keeps one source of truth for the header badge
(DECISIONS.md 016).

### `favorites`
A hirer's saved helper. `UNIQUE (user_id, helper_profile_id)` is what makes the heart idempotent.

### `assistant_messages`
Ask Sahaya's turns: `user_id`, `role` (`user` / `assistant` / `reset`), `body`, `actions` (JSONB —
what the assistant proposed, so the confirm buttons survive a reload), and `model` /
`input_tokens` / `output_tokens` so the API bill can be answered from the database. Its own table
rather than a `conversations` row with a bot participant, for the reasons in DECISIONS.md 023.
A `reset` row is a "start over" boundary: turns before it stop being shown and stop being sent to
the model, while the day's usage still counts.

---

## Admin

### `admin_actions`
`id`, `admin_id` FK, `action`, `target_type`, `target_id`, `note`. Append-only audit log: every
write in the admin panel appends one, including viewing an ID document.
