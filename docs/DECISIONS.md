# Decision Log

Append-only. Each entry records the decision, the reasoning, and what would make us revisit it.

---

## 001 — Kerala only at launch

**Decision:** Ship to Kerala's 14 districts with a seeded town list. No other state.

**Why:** A marketplace is only useful where it has density. Spreading thin across India would
mean a hirer in every city seeing three helpers and leaving. Kerala also has a genuinely
distinctive domestic-work market — live-in arrangements are common and Malayalam matters.

**Revisit when:** any single Kerala district has enough supply that hirers reliably find matches.
`districts` is a flat region table; expanding means adding a `states` table above it, nothing more.

---

## 002 — Both sides pay ₹99/month

**Decision:** Two Razorpay plans. Helpers pay to stay listed; hirers pay to unlock contact.

**Why:** The product's position is that it never takes a cut of a worker's salary. A flat fee is
the alternative. Charging both sides maximises revenue per match.

**Risk, stated plainly:** this doubles the cold-start problem — helpers must pay before hirers
exist, and hirers before helpers do. Mitigated by keeping browse and profile previews free on both
sides, so nobody is asked to pay before seeing real inventory.

**Revisit when:** first month's data. If supply stalls, making the helper side free is a pricing
config change, not a rebuild.

---

## 003 — Razorpay Subscriptions, not one-off orders

**Decision:** Real auto-renew mandates (UPI Autopay / e-NACH / card).

**Why:** ₹99 is small enough that manual monthly renewal would churn heavily. The retention
difference outweighs the extra integration work.

**Cost:** requires recurring-payments approval on the live Razorpay account — request it early.

---

## 004 — Vite SPA, not Next.js

**Decision:** Vite + React 19 + TypeScript, talking to FastAPI over REST.

**Why:** Keeps FastAPI as the single backend. Helper profiles sit behind auth and a paywall, so
they should not be indexed anyway — a domestic worker's details are not public data. Only
marketing pages need SEO, and those can be prerendered.

**Revisit when:** city/service landing pages ("maid in Kochi") become a real acquisition channel.

---

## 005 — Provider adapters instead of picking vendors now

**Decision:** `SmsSender`, `EmailSender`, `Storage`, `Imaging` are ABCs chosen by env var, with
console implementations for development.

**Why:** MSG91's DLT registration takes about a week and costs money. Blocking all auth work on
it would be absurd. The console adapter prints OTPs to the terminal, so every auth flow is fully
buildable and testable today.

**Second benefit:** this is also the AWS migration path. Local disk → S3 and console → MSG91 are
env flips, not code changes.

---

## 006 — Passwordless email auth

**Decision:** Email login is a 6-digit code. No passwords anywhere.

**Why:** No password field, no reset flow, no credential stuffing, nothing to leak. The SMS OTP
infrastructure already exists, so email OTP is nearly free to add.

---

## 007 — Monthly wage only, as a range

**Decision:** `wage_monthly_min` / `wage_monthly_max`. **No daily or hourly columns exist.**

**Why:** Domestic work in Kerala is arranged monthly. Supporting three rate types would multiply
filter complexity and let listings become incomparable. Removing the columns from the schema —
not just the UI — is what stops them creeping back.

A range sets honest expectations and leaves room to negotiate duties and hours.

---

## 008 — Bidirectional ratings

**Decision:** Helpers rate hirers and hirers rate helpers. One review per side per completed
engagement, enforced by `UNIQUE (hire_request_id, direction)`.

**Why:** A helper deciding whether to enter a stranger's home has at least as much at stake as
the household. A one-way rating system would make the worker the only party under scrutiny, which
contradicts the product's whole position.

---

## 009 — Auto background removal with a circular fallback

**Decision:** `rembg` cuts the portrait out on upload. On failure, the card renders a circular
crop that still straddles the panel edge.

**Why:** The breaking-the-box portrait is the most distinctive thing in the design, but helpers
will upload photos taken in poor light against busy backgrounds. **No helper may ever be blocked
from listing by a bad photo**, and the grid must never break.

Both the original and the cutout are stored. A failed cutout is a render decision, not data loss,
and lands in the admin queue for a human look.

**Revisit if:** the failure rate is high enough that the guided-capture step needs to become
stricter, or a paid segmentation API becomes worth it.

---

## 010 — Identity providers are verification sources only

**Decision:** Google, Apple, phone and email all end in a Sahaya-issued JWT pair. We never hold a
provider session.

**Why:** One auth backend serves web, Kotlin and Swift with no per-platform special cases. It
also means losing a provider is survivable.

`auth_identities` with `UNIQUE (provider, provider_subject)` is what makes one person one user.
Linking happens only on a *verified* email or phone match — never on an unverified claim, or an
attacker could register a victim's address and wait to be merged into their account.

---

## 011 — Webhook idempotency via a unique constraint

**Decision:** `webhook_events.razorpay_event_id` is UNIQUE, and the insert *is* the dedupe check.

**Why:** Razorpay retries, and can deliver the same event twice. A read-then-write check has a
race window between two concurrent deliveries; a unique constraint does not.

---

## 012 — No Docker, no queue, no websockets yet

**Decision:** Local PostgreSQL directly. Photo cutout runs as a FastAPI background task. Hire
requests poll.

**Why:** No Docker is a project constraint. The others are premature at this scale — and the
`imaging` provider interface is exactly where a queue slots in when the cutout stops keeping up.

---

## 013 — The Figma export is the front page spec

**Decision:** `docs/design.md` records the palette, type scale and anatomy sampled directly from
`design/sahaya.png`, and supersedes the palette and typography sections of `06-design-system.md`.
The terracotta accent is retired; walnut `#7A5235` is the only CTA colour. Instrument Serif is
replaced by Manrope for display, over the SF Pro/Inter system stack for body.

**Why:** the earlier palette was a reasonable guess at the brief. The Figma frame is not a guess —
it is the design. Where the two disagreed the mockup wins, and colours taken by sampling the
export beat colours taken by eye. Manrope is the face used in the Figma frame, confirmed by the
designer rather than inferred from the shapes; SF Pro cannot be self-hosted and Söhne is a paid
licence, so the system stack remains how body text actually gets them.

**Consequence:** `web/src/index.css` tokens were rewritten wholesale rather than nudged.

**Revisit when:** the Figma frame changes. Re-sample, do not re-eyeball.

---

## 014 — No smooth-scroll library, and no dark theme

**Decision:** Lenis is removed. The page scrolls natively. There is also no dark theme; every
colour is defined once and `color-scheme: light` pins the UA.

**Why (scroll):** smooth-scroll libraries trade precision for polish. Even at a lerp close to
native, the page keeps moving after the wheel stops and the reader overshoots. On a page whose
whole job is scanning a grid of people, that is the wrong trade. GSAP reads the real scroll
position for the header morph and needs no scroll hijacking to do it.

**Why (theme):** inverting this palette produces a different product rather than a darker one.
The walnut card header and the cut-out portraits both depend on a warm light ground.

**Related:** the header morph must never animate the height of anything above the scroll
position. Removing document height above the reader makes the browser jerk the scroll to
compensate, which reads as the page breaking. See `docs/design.md` section 5.

---

## 015 - No gooey, and the card is measured from Figma

**Decision:** `liquid-gooey` is removed. The pinned wordmark is a separate pill with a visible
gap to the search bar. The helper card is built to the measurements of Figma node `33:740`.

**Why (gooey):** fusing the wordmark into the search bar made one ambiguous object out of two
things that do different jobs -- a link home and a search control. Separated, both are easier to
read and easier to aim at, and there is no SVG filter to keep text out of.

**Why (measured):** the card is the product's most distinctive object and "close enough" showed.
Radii were the worst of it: the chips, stat cells and Available pill are 7px rounded in the
frame, and rendering them as pills is what most made the build stop looking like the design.

**Also settled here:** demo helpers now carry real cut-out portraits
(`backend/var/uploads/demo/`), so the breaking-the-box header is exercised in development instead
of only ever showing the monogram fallback. `STORAGE_PUBLIC_BASE` is now root-relative `/media`;
it pointed at port 8000 while the API runs on 8010, so every media URL 404'd.

---

## 016 — Free-form chat, gated on both sides; notifications are a thread, not messages

**Decision:** any family can message any helper and either can reply, but *sending* needs a live
membership on both sides. Reading is never gated. Notifications stay in their own table and the
chat page renders them as a pinned "Sahaya" thread.

**Why (gate):** chat is a way to reach someone, and contact is what the ₹99 buys. Chosen by the
product owner over the alternative of "sender must be subscribed, replies free".

**Risk, stated once:** a helper whose membership lapses cannot answer a family trying to hire
them, which loses both of them the match. The gate is one function
(`require_active_subscription` / the checks in `messages.py`), so relaxing it is a small change.

**Why (the thread):** copying notifications into `messages` would give the header badge two
sources of truth that can disagree. Rendering is enough.

**Detail worth keeping:** when the *other* side has lapsed, the API answers 409, not 402. A 402
makes the client show a membership prompt, and paying would not fix someone else's lapse.

---

## 017 — Realtime over WebSockets and PostgreSQL LISTEN/NOTIFY

**Supersedes** the "no websockets" part of 012.

**Decision:** one WebSocket per tab (`/api/v1/ws`), fanned out through `LISTEN/NOTIFY` on a
single listener connection per API process. The socket only announces -- sends and reads stay
REST -- and polling survives only as a slow fallback while it reconnects.

**Why:** an eight-second polling lag in a chat reads as broken. Redis is the usual fan-out, but
there is already a database and adding a service to run for chat events is the wrong trade at
this size. `NOTIFY` is transactional -- delivered only on commit -- so a message that fails to
save can never be announced, with no outbox table of our own. RDS supports it, so it survives
the move to AWS; if it is ever outgrown, `app/realtime/hub.py` is the only thing that changes.

**Details:** auth is the first frame, not the URL (browsers cannot set headers on a socket, and
query strings end up in logs). Close code 4401 means "refresh the token and retry"; 4403 means
the account was suspended and the client must stop. Suspending someone closes their open
sockets immediately.

---

## 018 — Categories are admin-managed: archive, never delete; slugs never change

**Decision:** services are created, renamed, reordered, re-iconed, put in the header and archived
from Admin -> Categories. The front page's tabs, search picker and header nav all read them from
`GET /taxonomy`. The seed script is insert-only for services.

**Why archive:** helpers reference their service by id. Deleting one would silently empty the
role line on every card in it. Archiving hides it from every public surface and from new
signups, while existing helpers stay listed and findable.

**Why immutable slugs:** they live in shared links (`/?service=home_nurse`). Changing one breaks
every link anybody has sent. The API rejects a `slug` in an update with 422 rather than ignoring
it, so a client can never believe a rename worked.

**Why insert-only seeding:** re-running a seed must never undo an admin's edit.

**Icons** come from one curated list, mirrored in `web/src/lib/serviceIcons.ts` and
`backend/app/api/v1/admin.py`, so the picker can never offer an icon the tabs cannot draw.

---

## 019 — ID documents are private; moderation is its own flag

**Decision:** verification documents are stored under a `private/` prefix that the public
`/media` mount refuses (case-insensitively), and are read back only through an admin endpoint
that streams them and writes an audit row per view. Hiding a listing uses a dedicated
`admin_hidden` column, never `is_listed`.

**Why private:** they are government IDs. A URL that works for whoever guesses it is a far worse
failure than any bug in the queue.

**Why a separate flag:** subscription webhooks rewrite `is_listed` whenever a payment lands. An
admin unlisting someone through that flag would be silently undone by their next renewal.

**Also:** every admin change appends an `AdminAction`, including viewing an ID -- "who looked at
whose ID" is exactly the question that gets asked afterwards.

---

## 020 — The palette moves from walnut and sand to moss and oat

**Supersedes** the palette in 013 (walnut `#7A5235` as the CTA colour).

**Decision:** the Figma frame was repainted and the build follows it: oat `#EDEBE2` page and card
body, paper `#FBF9F1` panel and cells, moss `#728156` header and CTAs, sage `#838F6B` for the
wordmark, pills and labels, ink `#464C39` for text. The layering (page → panel → card → cells)
is unchanged. Tokens were **renamed**, not repainted in place: `sand → oat`, `cream → paper`,
`walnut → moss`, `espresso → sage`.

**Why rename:** a class called `bg-walnut` that paints green would mislead every later reader.
Names avoid Tailwind's built-in `stone` and `olive` palettes so a token can never be mistaken for
a stock colour.

**Two deviations from the frame, both about contrast:** secondary prose uses a deeper olive
(`--color-ink-muted #616B4B`, 4.8:1) instead of sage, which is 2.9:1 on oat; sage stays on the
short labels the frame uses it for. Text on moss is 4.0:1, short of AA for the 16px View Profile
label -- kept as designed; `#66734C` would pass with the same hue if the designer wants it.

**Revisit when:** the frame changes again. Read the fills with `get_design_context`; do not
sample by eye.

---

## 021 — Phones: cards size to their container, search is its own component, pages open at the top

**Decision:** three things, all about small screens.

1. **The helper card is a container query** (`@container/card`), not a set of viewport
   breakpoints. At ≥393px of *card* width nothing matches and the Figma render is exact; below
   that the portrait scales with its overhang ratio, chips truncate, cells stack, and the footer
   sheds the availability line and then the Live-in chip — always one row.
2. **Search on a phone is `MobileSearch`**: a 56px pill in the sticky bar that opens a
   full-screen sheet. The desktop bar is unchanged above `md`. Both share `SearchValue`, the same
   hooks and the same `OptionRow`.
3. **Navigation lands at the top**, with back and forward restoring the position that entry had.

**Why containers:** the card renders in a 311px phone column, a 252px column on a 640px tablet and
a 364px sidebar. A tablet is narrower than a phone there, so the viewport says nothing useful.

**Why a separate phone search:** folded down, the desktop bar was 220px tall inside the sticky
element — a quarter of an iPhone screen held permanently while scrolling results.

**Why the Live-in chip is what goes:** chosen by the product owner over wrapping the footer (which
makes cards in a row different heights) or shrinking type toward 10px. Live-in is still on the
profile page and is a search filter.

**Detail worth keeping:** the sheet's resting position is CSS, not a JS animation. A frame clock
that stalls would otherwise leave a full-screen overlay off-screen with the page scroll-locked
behind it.

---

## 022 — Skills are admin-managed, on the same terms as services

**Decision:** Admin → Skills is Admin → Categories for the card chips: create, rename (including
Malayalam), reorder by dragging, and archive. Slugs are immutable, rows are archived and never
deleted, every write appends an `AdminAction`, and `GET /taxonomy` is the one place archived rows
are filtered out. Adding "Tailoring" is now a click, not a deploy.

**Why not deletion:** `helper_skills` rows point at a skill. Deleting one would silently strip a
chip off cards that are already listed, and nothing would say why.

**Why archiving stops the choosing but not the having:** an archived skill leaves the search
filter and the helper's own picker, but a helper who already has it keeps the chip — exactly as
helpers stay listed in an archived service. The alternative, editing people's profiles on an
admin's behalf, is a worse surprise than a stale chip. `PATCH /helpers/me` enforces the pair:
a slug already linked to this profile is allowed through, a new one is a 400 naming the skill.

**A bug this uncovered:** the seed *upserted* skills on every run, so a re-seed would have
overwritten an admin's rename and reorder. Skills are now insert-only, like services.

**Revisit when:** skills need grouping (a "cooking" family with sub-skills). The table has
`sort_order` and nothing else to unpick.

---

## 023 — Ask Sahaya is a second pinned thread that proposes and never sends

**Decision:** an in-chat assistant (`gpt-5-nano`), free for every signed-in account, with a
per-account daily message cap. It lives in the chat page as a second pinned thread — "Sahaya"
stays the read-only record of what we told someone, "Ask Sahaya" is a conversation — and it can
search the listings and offer to open a chat with a helper.

**Its own table, not a `Conversation` with a bot participant.** `conversations` is two `users.id`
columns with `CHECK (a < b)` and a unique pair, and every rule in `messages.py` assumes two human
accounts: a family and a helper, each needing a live membership to send, each with unread counts
and read receipts. A bot would need a user row, a role and a forged subscription, and would then
appear in the admin user list and the dashboard counts. Notifications stayed out of that table for
the same reason (016).

**It proposes; the person acts.** The assistant's only write path is a card with a button. The tap
runs `POST /conversations` and `POST /conversations/{id}/messages` — the same two calls a family
makes from a helper's profile — so the ₹99 gate and the role rules stay in exactly one place, and
no message is ever sent in somebody's name. A proposed `helper_profile_id` is re-validated against
a listed profile server-side, so a stale or invented id cannot become a button.

**Tool output carries no contact details.** Phone and email are the paywall; a paywall a language
model can be talked past is not one. The search tool returns cards only, and a test asserts the
phone number never appears in what the model is shown.

**Why free, with a cap:** support that costs money is not support, and a lapsed member is exactly
the person who needs to ask why. The cap (40 messages a day, 20 turns of history, 3 tool rounds,
700 output tokens) is what bounds the bill instead. "Start over" writes a boundary row rather than
deleting turns — deleting would also delete the day's count, making it a free way around the cap.

**The key is the only switch.** With `OPENAI_API_KEY` empty the provider reports itself
unavailable, `assistant_enabled` on the session is false, no surface offers the assistant, and the
endpoints answer 503 with a sentence saying what to do. A failed model call stores nothing, so a
retry cannot ask the same thing twice.

**Revisit when:** the bill or the transcripts say so. The provider seam is
`app/providers/llm/`; swapping model or vendor touches nothing above it.

---

## 024 — "Become a Helper" is a signed-out invitation

**Decision:** the header pill, the footer's "Find work" link and the Help page CTA appear only to
visitors who are not signed in. One hook, `useShowBecomeHelper()`, decides it everywhere.

**Why:** somebody here to hire is not looking for domestic work, and a helper already holds the
account the link leads to. The `loading` term in the hook matters as much as the rule: without it
a returning family sees the pill flash past during session restore.

**Also:** the price line under the front-page search bar now appears in the footer too, from the
same `PriceNote` component, because every page except the front page scrolled it away.

---

## 025 — Get Premium is a header button, and the price strip is gone

**Decision:** the ₹99 strip that sat directly under the front page's search bar is removed. In
its place, a moss **Get Premium** pill in every header, linking to `/pricing`, shown to everyone
who is not already a member (admins excluded). The footer keeps the full price sentence.

**Why:** a line of price copy immediately below the search bar competed with the thing people
came to use, and it appeared on exactly one page. A button in the bar is on every page, states
the offer in two words, and asks for nothing until it is clicked.

**Why `/pricing` and not the checkout:** what a membership unlocks differs for a family and a
helper, and a signed-out visitor needs an account before there is anything to buy. The pricing
page answers both and already holds the real `SubscribeButton`.

**Hidden below 640px:** the phone header has the search bar to fit. The profile menu already
carries "Get a membership" there.

---

## 026 — A cutout is framed when it is made, not when it is drawn

**Decision:** `Imaging.frame_subject` crops every cutout to the person — alpha bounding box,
a tenth of the subject's width as headroom, square, anchored at the top of the head — and stores
that. `rembg_impl` applies it after the plausibility check.

**Why:** rembg returns the camera's framing with the background erased, so a photo taken at arm's
length leaves the subject in the middle of a mostly empty image. The card's 145px square with
`object-cover object-top` then shows the emptiness: the first real upload was 768×1024 with the
subject starting 355px down, and rendered as a small head in the corner. Every demo fixture is
square and full-frame, which is why this was invisible until somebody uploaded a photo of
themselves.

**Why at cutout time:** the browse card, the account preview and the admin thumbnail all draw the
same file. One framed file is right in all of them at any size; CSS per surface is three places
to get it wrong. It also cut the stored file from 266KB to 104KB.

**Existing rows** were re-framed into new versioned keys (a new key, because a browser holding
the old file would otherwise keep showing it). The demo fixtures were deliberately left alone:
they use one file as both the cutout and the "original photo", so cropping them would crop the
profile page's photo too.
