# Design — the Sahaya front page

The single source of truth for the front page. Every colour, size and radius here was
**sampled from `design/sahaya.png`**, the Figma export, rather than eyeballed. Where this doc
and `06-design-system.md` disagree, this one wins; that file's palette table is superseded.

---

## 1. Palette

Read from the Figma frame "Sahaya" (node `23:2`) with `get_design_context`, so these are the
frame's own fills rather than samples of an export. Five colours carry the whole page. (The
palette was repainted from walnut and sand to moss and oat -- `DECISIONS.md` 020.)

| Token | Hex | Where it appears in the mockup |
|---|---|---|
| `--color-oat` | `#EDEBE2` | page ground **and** the helper-card body |
| `--color-paper` | `#FBF9F1` | results panel, nav pills, search bar, chips, stat cells, tabs |
| `--color-moss` | `#728156` | card header, View Profile button, the search circle, the active wage toggle |
| `--color-sage` | `#838F6B` | wordmark, "Available" and "Available Results" pills, chip text, cell labels |
| `--color-ink` | `#464C39` | the headline, nav links, search-bar labels |
| `--color-ink-muted` | `#616B4B` | subheading and other secondary prose (see *Contrast* below) |
| `--color-ink-faint` | `#838F6B` | tertiary text, inactive tab labels |

### The inversion worth catching

The obvious reading of the mockup is paper cards on an oat page. **It is the other way round.**
The results panel is paper (`#FBF9F1`); the helper cards sitting on it are **oat** — the same
`#EDEBE2` as the page behind everything — and the chips and stat cells *inside* each card go
back to paper. So the stack alternates:

```
oat page  ->  paper panel  ->  oat card  ->  paper cells
```

Getting this backwards is the single easiest way to make the page look almost-right and wrong.

### Support colours

| Token | Hex | Role |
|---|---|---|
| `--color-rule` | `#838F6B` at 50% | the card's internal rules, exactly as the frame draws them |
| `--color-line` | `#D6D8C8` | hairline dividers on oat |
| `--color-line-soft` | `#E4E4D8` | hairline dividers on paper |
| `--color-field` | `#778260` | control borders -- 3:1 against both oat and paper |
| `--color-star` | `#464C39` | the rating stars (filled) |
| `--color-verified` | `#3F6B4A` | the rosette beside a name |

### Contrast, where the frame and WCAG disagree

- **Secondary prose.** The frame sets secondary text in sage, which is 2.9:1 on oat -- under
  the 4.5:1 AA asks of body text. Sage stays where the frame uses it on short labels (chips,
  cell labels, pills, tab labels, the wordmark); anything longer than a label uses
  `--color-ink-muted`, a deeper olive at 4.8:1 on oat and 5.4:1 on paper.
- **The results heading** is sage as designed, set bold at 20px so it counts as large text;
  3.25:1 on paper clears the 3:1 large-text bar.
- **Text on moss.** `#FBF9F1` on `#728156` is 4.0:1 -- short of 4.5:1 for the 16px View Profile
  label. Kept as designed. If AA is required, moss `#66734C` reaches 4.8:1 with the same hue.

**One CTA colour.** Moss means "this is the action". Sage is its quieter sibling and is never
used for a button.

### There is no dark theme

Deliberately. Inverting this palette produces a different product rather than a darker one: the
moss card header and the cut-out portraits both depend on sitting against a light ground,
and a dark version of them looks broken rather than nocturnal. Every colour is defined once, on
bare `:root`, and `color-scheme: light` pins the UA so form controls and the canvas behind the
page do not go dark on their own.

### The scrollbar

Styled, not hidden. The platform default is a grey slab bolted to the right of a warm page and it
is the loudest wrong colour on screen; hiding it entirely would cost the position feedback a page
this long needs. 10px, `--color-line` thumb inset by a transparent border with
`background-clip: content-box`, `--color-field` on hover. Firefox gets `scrollbar-color`.

---

## 2. Typography

The Figma headline is **Manrope** — the face used in the frame itself, confirmed by the designer.
Not SF, not a serif.

- **Display — Manrope** (Google Fonts, open licence), weights 400/500/600/700/800.
  Hero, card names, section heads, buttons. The hero runs at 700; 800 is reserved for the
  wordmark.
- **Body — the Apple/ChatGPT system stack.** SF Pro on Apple hardware, Segoe UI on Windows,
  Inter as the shipped fallback. SF Pro cannot be legally self-hosted for web and Söhne
  (ChatGPT's face) is a paid licence, so the stack *is* how you get them:
  `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, system-ui, sans-serif`
- **Malayalam — Noto Sans Malayalam.** Names and place names will render in it.

Instrument Serif is dropped entirely.

### Scale, measured off the export

| Element | Size | Weight | Tracking |
|---|---|---|---|
| Hero headline | `clamp(40px, 5.4vw, 64px)` | 700 | `-0.03em` |
| Hero subheading | 15px / 1.55 | 400 | `0` |
| Nav link | 15px | 500 | `-0.005em` |
| Wordmark `sahaya.` | 22px | 800, sage | `-0.03em` |
| Search field label | 12px | 600 | `0` |
| Search field value | 15px | 400 | `0` |
| Card name | 21px | 600 | `-0.02em` |
| Chip / stat label | 12px | 500 | `0` |
| Stat value | 15px | 500 | `0` |
| Button | 15px | 500 | `-0.01em` |
| Tab label | 11px | 500 | `0` |

**Rules.** `tabular-nums` on every wage, rating and counter so numbers do not jitter.
`text-wrap: balance` on headings, `pretty` on paragraphs. Body never below 15px — this audience
reads on cheap phones in bright light.

---

## 3. Shape and spacing

Concentric radii — a nested corner is always tighter than its parent, or the gap looks wrong.

| Token | Value | Used by |
|---|---|---|
| `--radius-pill` | `999px` | nav pills, chips, buttons, the two circles |
| `--radius-cell` | `10px` | stat cells |
| `--radius-card` | `16px` | helper cards |
| `--radius-tab` | `12px 12px 0 0` | the folder tabs |
| `--radius-panel` | `24px` | the results panel |
| `--radius-search` | `44px` | the hero search bar |

Spacing is a 4px scale. Page gutter 40px at ≥1280px, 24px at tablet, 16px on phone.
Content max-width **1432px** (the mockup is 1512px wide with 40px gutters).

Shadows are almost absent by design — depth comes from the oat/paper layering, not from
drop shadows. Two only: `--shadow-raise` on the search bar, and `--shadow-menu`
on the open dropdowns.

---

## 4. Page anatomy, top to bottom

### 4.1 Header (static state)

`sahaya.` wordmark left, service links centred (Home Nurse, Care Taker, Household Helps,
Baby Sitter), right cluster of a "Become a Helper" pill and two 36px circles.

The two circles, which are blank in the Figma:

- **Circle 1 — profile.** Avatar when signed in, `user-round` glyph when not. Opens a dropdown:
  *My profile, My hires, Liked profiles, Subscription, Settings, Help, Sign out*. Signed
  out, it offers Continue with Google / phone / email instead.
- **Circle 2 — chat and alerts.** `message-circle` glyph with an unread dot at the top-right
  (sage fill, oat ring so it reads against the circle). Opens the notification panel.

### 4.2 Hero

Headline "Good help, hired directly." centred, ink (`#464C39`), tight. Two-line subheading below in
`--ink-muted`. Both are centred on the page, not on a column.

### 4.3 Search bar

A paper pill, three segments divided by hairlines, and a moss circle at the right end. The
reference is Airbnb's search bar, and three mechanics carry it:

1. **Content must not move the layout.** Segments sized by their own text mean picking
   "Thiruvananthapuram" shoves the wage toggle sideways and squeezes the submit button off the
   end. The row is a grid of fixed fractions; every segment is `min-w-0` and truncates. Values
   change, geometry does not.
2. **A segment is a pill inside a pill.** A square hover fill inside a 44px-radius container
   looks broken at the ends, so each segment's hover state is itself a full pill, inset.
3. **Dividers know about their neighbours.** A hairline next to a filled hover state looks like a
   mistake, so each divider fades out when either segment it separates is hovered or open. An
   open panel outranks a hover, so the segment you are choosing from stays lit while the pointer
   wanders. This is the single detail that most makes a bar like this read as finished rather
   than assembled.

| Field | Label | Control |
|---|---|---|
| 1 | Where do you need help? | District then town combobox, 14 districts / 128 towns from `GET /api/v1/geo/*` |
| 2 | What do you need help with? | Service select from `GET /api/v1/taxonomy` |
| 3 | Wage Type: | Segmented **Daily / Monthly** |

Every segment is the same two-line stack -- a 12px label on one baseline, a 20px value row on
the next, the wage toggle included. Laying any one of them out by hand is what put the wage label
half a line high and let the toggle bulge out of its row into the label above it.

**The wage toggle is locked to Monthly.** `Daily` renders visibly disabled with the title
"Daily rates coming soon" — present, inert, honest. This is not a UI whim: per
`DECISIONS.md` 007 there is no daily wage column in the schema at all. The mockup shows Daily
in the filled state; we invert that, Monthly filled and Daily greyed.

The circle at the end is the submit; it carries a `search` glyph (blank in the Figma).

### 4.3a Get Premium

The one offer in the bar, so the only moss-filled thing in it: a pill between "Become a Helper"
and the two circles, on every page's header. It links to `/pricing` rather than opening Razorpay,
because what a membership unlocks differs by side and a signed-out visitor needs an account
first — `/pricing` answers both and holds the real checkout button.

Hidden from anyone it would insult: an active member, and admins, who have no membership. Below
640px it gives the row to the search bar, and the profile menu carries "Get a membership" there.
On the front page it fades with the nav as the bar morphs — the scrolled state belongs to the
search bar, and a third pill beside it crowded 1024px.

It replaced a price strip that sat directly under the search bar. One line of price copy
immediately beneath the thing people came to use was competing with it, and it only ever appeared
on the front page; the button is on every page, and the footer states the price in full.

### 4.4 Service tabs

A row of folder tabs that sit *on* the top edge of the results panel. Three details do the work:

1. **Inverted corners.** A rounded-top paper shape still leaves two hard 90-degree notches where
   it meets the panel, which is exactly what makes a tab row look unfinished. `.tab-surface`'s
   two pseudo-elements are transparent squares with one rounded corner, filled by a `box-shadow`
   that spills paper into the rest — a concave curve that flows tab into panel with no seam.
2. **One surface, not eight.** The active fill is a single element carrying a `layoutId`, so
   switching tabs *slides* it across. One object moving reads as one object; two cross-fading
   reads as a bug.
3. **The panel's top-left corner is square only while "All Services" is active** — that first tab
   is flush against it, and a 24px radius there carves a oat wedge out from under it. Any other
   tab sits further along the row where its own inverted corners handle the seam, so the corner
   goes back to being round.

Inactive tabs are oat. Each has an icon above an 11px label. The icon names come from the API
(`services[].icon`, already lucide names): `sparkles`, `chef-hat`, `stethoscope`,
`heart-handshake`, `baby`, `car-front`, `flower-2`, plus `layout-grid` for "All Services".

The Figma's tab labels are a coarser grouping than the seven seeded services. The tabs are driven
by the API so the list cannot drift from the backend; "All Services" is prepended client-side.

### 4.5 Filter bar

Right-aligned, level with the tabs. `Sort by: Recommended` in a paper pill (opens the four sorts
the browse endpoint accepts: rating, wage_low, wage_high, newest) and a `Filters` pill opening a
sheet with district, town, skills, live-in, shift, hours and max wage — every one of which
`GET /api/v1/helpers` already supports.

### 4.6 Results panel

Paper, radius 24px, running to the bottom of the page. Header row: "Meet your everyday helpers."
with "A helping hand, for whatever life needs." beneath, and an sage pill on the right
reading `Available Results: N`, where N is the live `total` from the browse response.

### 4.7 The helper card

Measured from Figma node `33:740` ("user 1") rather than eyeballed. At the frame's 393px
reference width:

| Part | Spec |
|---|---|
| card | 393x300, radius **15**, fill `#EDEBE2` |
| header | **111** tall, radius 15 on top only, fill `#728156` |
| portrait | **145x145**, 34px above the card's top edge, 13px from its right |
| chips | 77x22, radius **7**, fill `#FBF9F1` |
| stat cells | 49 tall, radius **7**, fill `#FBF9F1` |
| Available pill | 77x22, radius **7**, fill `#838F6B` |
| View Profile | 129x44, radius 39 (a pill), fill `#728156` |
| rules | 1px sage at 50% -- notably darker than `--color-line` |

**The chips, cells and Available pill are 7px rounded, not pills.** Only View Profile is fully
round. Making everything a pill is the single change that most makes this stop looking like the
design.

Two departures from the frame's own exported assets:

- **Stars** are drawn glyphs, not the frame's SVG. That file carries
  `preserveAspectRatio="none"` on a 14.6x14.0 viewBox, so rendering it into a square box
  stretches it.
- **The verified badge** carries a check. The frame's badge is a bare starburst with nothing
  inside it, which reads as decoration rather than as a claim about the person.

The five bands, top to bottom:

1. **Moss header** (moss, radius 16px on top, ~110px tall). Name in paper at 21px with the
   verified rosette after it, `Rating:` and five stars beneath. The **portrait is cut out and
   breaks above the header's top edge** — it overflows the panel by roughly 40px and is clipped
   only at the header's bottom. This is the thing that stops the grid looking like every other
   marketplace.
2. **Chip row** — up to three skill chips, paper fill, **7px** radius. Overflow becomes `+N`.
3. **Divider** — one hairline.
4. **Two stat cells**, paper, **7px** radius: `Language:` with its value, and `Wage per Month:`
   with its value. Wage renders as a range, `₹15,000–19,000`, tabular.
5. **Footer** — sage `Available` pill, then `Full Day / 12 Hours` from `shifts` and
   `hours_per_day`, then the moss `View Profile` button. A `Live-in` chip joins the row when the
   helper is open to living in. The row never wraps: the availability line is the part that
   truncates, so every card in a row stays the same height.

---

## 5. The scroll morph

One GSAP `ScrollTrigger`, scrubbed over exactly the distance the search bar travels to reach the
top (`end: () => "+=" + bar.offsetTop`). Any shorter and it finishes with the bar still mid-page;
any longer and it is still running after the bar has stopped moving.

1. Headline, subheading and nav fade as they scroll away.
2. A `sahaya.` pill slides in from the left and settles, with a clear 31px gap to the bar.
3. The bar's frame widens from 680px to 1000px and its left margin opens to 157px.
4. The account and alerts circles fade in at the right of the page.

### Four mechanics, each replacing something that was wrong

**The bar is `position: sticky`, not GSAP-pinned.** ScrollTrigger's `pin` freezes an element
where it already is; for a bar sitting 400px down the page that means pinning it mid-viewport and
leaving a hole behind it. Sticky is what actually expresses "rise to the top and stay". It also
means the whole page is rendered *inside* `SiteHeader` -- a sticky element only sticks within its
own parent's box.

**Nothing above the scroll position animates its height.** The hero used to collapse to zero as
it faded, to hurry the bar to the top. Removing document height above the reader makes the
browser jerk the scroll position to compensate -- a sudden lurch that made the whole page feel
broken. Now nothing collapses; the hero scrolls away and the sticky bar arrives on its own.

**The wordmark is its own pill, and it is out of flow.** An earlier version fused it into the bar
with `liquid-gooey`. Two distinct objects with a visible gap read better and aim better, and the
wordmark stays a link home rather than looking like part of a search control. It is
`position: absolute` because `visibility: hidden` still occupies space -- in flow it stole ~125px
from the bar at rest, which is why the bar sat narrower than its own max-width. GSAP opens the
form's `margin-left` to clear it.

**GSAP owns width and offset, not React.** Driving them from a `setState` in `onUpdate` means a
render round-trip that can simply not happen, and when it does not, the wordmark lands on top of
the first field.

**Reduced motion, and anything under 768px:** none of it is created. No ScrollTrigger, no
wordmark pill; the bar is a plain sticky element.

## 6. Motion budget

**There is no smooth-scroll library.** Lenis was added, tuned down, and then removed. Even at a
near-native lerp the page keeps gliding after the wheel has stopped, and you overshoot what you
were reading — which is the wrong trade on a page whose whole job is scanning a grid of people.
Native scrolling is the better default. Programmatic jumps go through `scrollTo` in
`lib/motion.ts`, which checks the reduced-motion setting per call rather than forcing
`scroll-behavior: smooth` on every anchor in the stylesheet.

GSAP drives the header morph and nothing else. Tab switching and popovers use `motion`'s spring
layout animations. Everything else is a CSS transition of 150–250ms on `transform`, `opacity`,
`background-color` or `color` — never `transition: all`.

---

## 7. Responsive

| Breakpoint | Grid | Search | Header |
|---|---|---|---|
| ≥1280px | 3 cards | the bar: one row, three fields | full morph |
| 768–1279px | 2 cards | the bar: one row, three fields | full morph |
| <768px | 1 card | a 56px pill that opens a full-screen sheet | plain sticky bar |

Below 768px the morph is not shortened — it is never created. No ScrollTrigger and no wordmark
pill; the bar is a plain sticky element. Reduced motion takes the same path at every width.

**Search on a phone is its own component** (`MobileSearch.tsx`), not the desktop bar folded up.
The sticky bar carries one 56px pill summarising the current query; tapping it opens a
full-screen sheet with the three fields at full size and a Search button above the safe area.
It reads and writes the same `SearchValue` through the same hooks and the same `OptionRow` as
the desktop bar, so the two cannot offer different options. The sheet's resting position is plain
layout and its entrance is a CSS animation, so a stalled frame clock can never leave a
full-screen overlay parked off-screen with the page behind it locked.

**The helper card sizes itself to its container, not the window** — see section 4.7. The same is
true of the card preview inside the photo upload.

Service tabs are a `.scroll-x` row on phone; filters open as a bottom sheet, and the phone filter
row is two truncating buttons that share the width. Every tap target is at least 44px at phone
sizes and keeps its denser desktop size from `sm` up. Text fields are 16px on phones, because
Safari zooms the page in on any smaller field and never zooms back out. `index.html` carries
`viewport-fit=cover` (without it every `env(safe-area-inset-*)` is 0) and
`interactive-widget=resizes-content`, so the keyboard resizes the page rather than covering the
chat composer.

**Verify with element positions, not with a scrollbar.** `body { overflow-x: hidden }` means
content past the screen edge is clipped and invisible rather than scrollable, so "the page does
not scroll sideways" proves nothing. Measure every element's `right` against
`document.documentElement.clientWidth`, and check `window.innerWidth === clientWidth` — a card
that cannot shrink stretches the layout viewport itself.

---

## 8. The other pages

Everything off the front page keeps the front page's layering: oat page, paper panels
(`Surface`, radius 24), oat insets inside them (radius 15), 7px chips and pills, and full round
only for buttons. Pages are scaffolded by `PageShell` (title, subtitle, optional actions); the
shared kit is `web/src/components/kit/`. Reasoning for the patterns below is in
`docs/design-lessons.md` section 9.

| Route | Page | What it is |
|---|---|---|
| `/signin`, `/join` | Sign in / Join | Phone first and pre-selected, then email and Google. Joining asks the side first (`?as=helper` or `hirer`). `?next=` is honoured only for same-site paths. Afterwards: admins to `/admin`, helpers to `/account`, families to `/`. |
| `/pricing` | Pricing | Families/helpers toggle, defaulting to the signed-in side. ₹99, what it unlocks, and the right button for the visitor's state (join, subscribe, or manage). |
| `/helpers/:id` | Helper profile | The **original** photo, never the cutout. Details, skills, reviews, an honest note on what the badges mean. Contact panel: sticky rail at ≥1024px; below that an inline panel plus a fixed bottom bar. Families without a membership see the membership card instead of buttons that would fail. |
| `/account` | My profile | Helpers edit beside their live card: photo upload showing the cutout (card) and the original (profile) side by side, the card fields, verification documents, and a save bar while changes are unsaved. Families: household, location, and the reviews helpers have left them. |
| `/messages`, `/messages/:id` | Chat | Two panes at ≥768px, list-then-thread below. Two pinned threads: **Sahaya** (`/messages/sahaya`) is the notifications, read-only; **Ask Sahaya** (`/messages/assistant`) is the assistant, and appears only where a key is configured. Enter sends (never mid-IME), Shift+Enter is a new line; typing indicator, "Seen", day dividers, retry on a failed send; a blocked composer says whose membership is missing. Fills the window below the 72px header, with no footer. |
| `/hires` | Hires | Open, Done and Closed. Only the moves legal for this side at this status are offered; decline, withdraw and complete confirm first. Reviews use a five-star picker. |
| `/saved` | Liked profiles | The front page's cards on a paper panel. |
| `/settings` | Settings | Account (name; a new phone or email is re-verified by code), notifications, membership (turning off renewal keeps the paid days), privacy, deactivate. Each section is linkable (`#membership`). |
| `/help` | Help & safety | How it works for each side, the money, and what "ID verified" and "Police verified" mean. |
| `/admin/*` | Admin | Sidebar (a pill row on small screens) with live counts on the two queues: Dashboard, Verification, Photos, Users, Listings, Memberships, Categories, Skills, Audit log. Plainer and denser than the public pages; tables scroll sideways inside their own box. |
| `*` | Not found | |

### Admin → Categories

A reorderable list: drag handle, or up/down buttons for keyboard users. Each row shows the icon,
English and Malayalam names, helper counts, the slug, an "In header" toggle, edit and archive.
Beside it, the real `ServiceTabs` previews the unsaved order, and the header links are shown as
they will read (with a warning past about four). Editing opens a side sheet with the icon picker
— drawn from the same `SERVICE_ICONS` list the tabs use, so it can never offer an icon the tabs
cannot draw. The slug follows the name on create and is read-only afterwards. Archiving states
how many helpers it affects before it happens.

### Admin → Skills

The same screen for the card chips, sharing the list parts in `pages/admin/taxonomyList.ts` and
`IconButton` from the kit. A row is the name, the Malayalam name, how many helpers have the skill
and how many of those are listed, and the slug; the controls are reorder, edit and archive. The
preview beside it is the real `ChipToggle` in the saved order — what the search filter and a
helper's own picker draw — rendered `inert`, because selecting one here would mean nothing.
Archiving says how many helpers have the skill, and that they keep it.

### Ask Sahaya

A thread, not a floating widget: the second pinned row in the chat list, with the sparkle mark so
it cannot be mistaken for the updates thread. Bubbles, day dividers and composer are the same
components as a real conversation (`pages/chat/parts.tsx`), so the 16px input, safe-area padding
and IME-safe Enter are shared rather than copied.

What is particular to it: a fixed greeting above an empty thread (a greeting that costs money and
varies is a worse greeting); a three-dot indicator while it thinks; **proposal cards** under a
reply — the helper's name, the draft in quotes, *Send and open chat*, and a link to the profile —
and a line under the composer saying it can get things wrong and never messages anyone without a
tap. Past 30 of the 40 daily messages that line also counts down; at zero the composer is replaced
by a sentence. Where no API key is configured the row does not exist, and a hand-typed URL says
so plainly instead of offering a composer that can only fail.

### Header menus, finished

The profile circle is role-aware: helpers get *My profile, Messages, Hire requests*; families
*My profile, Messages, My hires, Liked profiles*; admins *Admin, Messages*. Everyone gets
membership, settings, help and sign out. The chat circle's badge counts unread alerts plus unread
messages (`/me/unread`); its panel lists the latest alerts and links to the Sahaya thread.
*Ask Sahaya* sits under *Messages* in the profile menu wherever the assistant is configured.

### The footer

Wordmark and one line of what Sahaya is, two link columns (Product, Kerala), then the price —
`PriceNote`, which is also where the front page's old price strip went, above a rule —
and the copyright. The front page states the price under the search bar and scrolls it away; the
footer is where every other page says it. "Find work" and the header's "Become a Helper" are
there for signed-out visitors only (DECISIONS.md 024).
