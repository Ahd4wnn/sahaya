# Design System

> **Superseded in part.** The palette and typography below were the pre-Figma direction.
> `docs/design.md` carries the colours, type scale and anatomy sampled from the Figma export
> and is authoritative for anything they disagree on. The rest of this file — component
> behaviour, the card fallback chain, accessibility rules — still stands.

## Direction

Warm, calm, editorial. Beige ground, walnut brown, terracotta for action. The reference point is
**Function Health's** membership card — cream field, serif display, rust CTA — combined with
**Airbnb's** card-and-sticky-rail marketplace mechanics and **Apple HIG** restraint.

This is not a decorative choice. Warm neutrals are the current convention in home services and
healthcare specifically because they read as trustworthy and grounded rather than cold-corporate,
and Sahaya is asking strangers to trust each other inside their homes.

## Colour

Tokens live in `web/src/index.css` under Tailwind v4 `@theme`. Every colour is defined on bare
`:root` first; the dark block only *redefines*. No colour has its sole definition inside a media
query.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--canvas` | `#FAF6F0` | `#161310` | page ground |
| `--surface` | `#FFFDFA` | `#221D18` | raised cards |
| `--border` | `#E8DFD2` | `#332B24` | hairlines |
| `--ink` | `#1A1613` | `#F5EFE7` | primary text — near-black, never `#000` |
| `--ink-muted` | `#6E6259` | `#A3968A` | secondary text |
| `--primary` | `#6B4A2F` | `#C4A07C` | walnut — nav, headings |
| `--accent` | `#B4552D` | `#D2703F` | terracotta — **the only CTA colour** |
| `--verified` | `#3F6B4A` | `#6B9E78` | trust badges only |
| `--card-header` | `#F0DFC0` | `#3A2E20` | the tan panel behind the cutout portrait |

Dark mode inverts *warm*, not grey. A neutral-grey dark theme under this palette looks broken.

**One accent.** Terracotta means "this is the action". If everything is terracotta, nothing is.

## Typography

The brief was "the font Apple and ChatGPT use". The honest position:

- **SF Pro cannot be legally self-hosted for web.** The system stack is how you actually get it —
  real SF on Apple devices, Segoe UI on Windows, Inter as the shipped fallback:
  ```
  -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, sans-serif
  ```
- **ChatGPT's typeface is Söhne** (Klim Type Foundry), a paid commercial licence. Inter is the
  standard free stand-in and is what ships.
- **Display:** `Instrument Serif` — hero and section heads *only*. This single choice is what
  makes the beige read as editorial warmth rather than a default Bootstrap cream.
- **Malayalam:** `Noto Sans Malayalam` in the stack. Names and place names will render in it.

**Rules**
- `font-variant-numeric: tabular-nums` on every wage, rating and counter, so numbers do not
  jitter as they change.
- Body copy 16px minimum. This audience includes people reading on cheap phones in bright light.
- `text-wrap: balance` on headings, `pretty` on paragraphs.

## Shape and depth

**Concentric radii** — a nested corner must be tighter than its parent or the gap looks wrong:

```
card 16px  →  image 12px  →  chip 8px  →  input 10px
```

Elevation is layered, not heavy. Two shadow levels total: a hairline border plus a soft ambient
shadow for raised surfaces. No drop shadows on text, ever.

## The helper card — the signature component

Adapted from the reference image. **No voice note.**

```
┌─────────────────────────────────┐
│  ╭───────────────────────╮  ◜◝  │  ← portrait overflows the panel's TOP edge
│  │ Fathima Nida  ★ 4.8   │ ( ● )│
│  │ Home Nurse            │  ◟◞  │
│  ╰───────────────────────╯      │
│  [Cooking][Cleaning][Elder →    │  ← chips scroll inside their own container
│  ─────────────────────────────  │
│   6 yrs  │ Malayalam │ ₹8–12k   │  ← three stat cells
│   Exp.   │ Hindi     │ /month   │
│  ─────────────────────────────  │
│  Full day · 8 hrs   [ Live-in ] │
│                   [ View → ]    │
└─────────────────────────────────┘
```

**The overflow is the whole trick, and it is where this breaks.** The portrait sits at the right
of the tan header panel with a negative top margin, and the panel needs `overflow: visible`. The
**card root must carry `isolation: isolate`** — without it the overflowing image escapes its
stacking context and bleeds over neighbouring grid cells. Grid gaps must leave headroom for the
overflow, and the card needs top padding so the portrait is not clipped by the grid container.

**Cutout pipeline** — `providers/imaging/`:

1. On upload, `rembg` segments the subject to a transparent PNG → `photo_cutout_key`,
   `cutout_status = 'done'`. Card renders the true breaking-the-box look.
2. On failure, poor input, or `IMAGING_BACKEND=noop` → `cutout_status = 'failed'`. The card
   falls back to a **circular crop that still straddles the panel edge**, so it still visibly
   breaks the box.

**The layout never breaks and no helper is ever blocked from listing by a bad photo.** Both keys
are kept; the fallback is a render decision, not data loss. Failed cutouts land in the admin
queue for a human look.

## Principles applied

**Apple HIG** — clarity (content first, chrome minimal); deference (translucent blurred nav,
content scrolls beneath); depth through layering; 44px minimum hit targets;
`prefers-reduced-motion` fully honoured.

**Airbnb DLS** — *Unified, Universal, Iconic, Conversational*, plus its actual mechanics: one
typeface, one accent, soft shapes, photo-led depth. Taken directly:
- card-first browse grid
- **sticky right-rail action card** on helper detail — Airbnb's "Reserve" panel becomes our
  "Request hire" panel, same anatomy
- **trust badges** — "Superhost"/"Guest favourite" become **Verified ID**, **Police verified**,
  **Top rated**
- concentric radii

## Motion budget

Three animation libraries is a real risk of a page that feels like a demo reel. So:

| Library | Used for | Not used for |
|---|---|---|
| `motion` | section entrances, list stagger, page transitions | anything decorative |
| `torph` | the verified-helper counter; the ₹ figure when toggling plan on pricing | body copy |
| `liquid-gooey` | **one** moment: the landing hero role-selector morph | anywhere else |

`torph`'s numeric place-value morph is genuinely the right tool for a changing ₹ figure — digits
roll by place instead of the whole number swapping. That is the one job it does here.

Everything is gated behind `prefers-reduced-motion: reduce`.

## Craft rules

From `/craft`, enforced in review:
- No decorative gradients. No glow effects.
- Never `transition: all` — name the properties.
- `isolation: isolate` on every stacking context.
- Real content, never lorem ipsum or placeholder names.
- Visual variety: not every section is a centred column of cards.

## Accessibility floor

WCAG 2.1 AA. 4.5:1 for body text, 3:1 for large text and UI boundaries. **The warm palette needs
real measurement** — mid-tone browns on beige fail contrast more often than they look like they
should, and `--ink-muted` on `--canvas` is the pair most likely to fail. Visible focus rings on
everything focusable, full keyboard paths, every input labelled.
