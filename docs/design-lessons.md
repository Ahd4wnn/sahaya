# Design lessons

Everything learned building Sahaya's front page against the Figma frame. Most of it was learned
by getting it wrong first, so each entry says what the mistake looked like — a rule you can't
recognise in the wild is not much use.

`docs/design.md` is the *spec* (what the page is). This is the *reasoning* (why it is that, and
what breaks when it isn't).

---

## 1. Colour

### The five colours

The frame was repainted from walnut and sand to moss and oat (`DECISIONS.md` 020).

| Token | Hex | Role |
|---|---|---|
| `--color-oat` | `#EDEBE2` | page ground **and** helper-card body |
| `--color-paper` | `#FBF9F1` | results panel, nav pills, search bar, chips, stat cells, tabs |
| `--color-moss` | `#728156` | card header, every primary CTA, the search circle |
| `--color-sage` | `#838F6B` | wordmark, Available pill, results-count pill, chip text, cell labels |
| `--color-ink` | `#464C39` | headline, nav, labels -- the frame has no black text at all |

Support: `--color-ink-muted #616B4B`, `--color-ink-faint #838F6B`, `--color-rule` (sage at 50%),
`--color-line #D6D8C8`, `--color-line-soft #E4E4D8`, `--color-field #778260`,
`--color-on-moss #FBF9F1`, `--color-on-moss-muted #EDEBE2`.

### The layering inverts, and the intuitive reading is backwards

The obvious reading of the mockup is *paper cards on an oat page*. It is the other way round:

```
oat page  →  paper panel  →  oat card  →  paper chips and cells
```

The results panel is paper, the cards on it go back to oat — the same colour as the page behind
everything — and the chips and stat cells inside them return to paper. Get this backwards and the
page looks almost-right and unmistakably wrong, in a way that is hard to name while staring at it.
The repaint did not change this: the structure survived a complete change of hue, which is the
best evidence it is the design and not a colour accident.

### Rules are darker than you think

`--color-rule` is sage at 50%, much darker than `--color-line`. On oat, at card scale, a light
hairline simply disappears and the card's three bands stop reading as bands. Taken from the
frame, not chosen -- and kept translucent, so it reads the same on oat and on paper.

### Rename tokens when the colour changes; do not repaint them in place

A repaint could have been six hex edits in `index.css`. It was not, because `bg-walnut` that
paints green is a lie every later reader has to decode, forever. The tokens were renamed
(`sand → oat`, `cream → paper`, `walnut → moss`, `espresso → sage`) by a script that matched
whole words only and refused to write any file whose line count changed. Two traps avoided on the
way: Tailwind ships `stone` and `olive` palettes of its own, so neither is a safe token name.

It was cheap because every colour already was a token. The only hard-coded hexes in the app were
the Razorpay checkout theme and code comments. Keep it that way.

### The frame is not always accessible, and that is a decision, not an accident

The frame sets secondary text in sage -- 2.9:1 on oat, under the 4.5:1 WCAG AA asks of body
text. Sage stays where the frame uses it on short labels; longer secondary prose uses
`--color-ink-muted`, a deeper olive at 4.8:1. Text on moss is 4.0:1 and was kept as designed;
`#66734C` would reach AA with the same hue. See `docs/design.md` section 1.

### One CTA colour

Moss means "this is the action". Sage is the quieter sibling and is never a button. The original
build had a terracotta accent as well; the frame never used it, and it was retired.

### There is no dark theme, deliberately

Inverting this palette produces a *different product*, not a darker one. The moss card header
and the cut-out portraits both depend on sitting against a light ground. `color-scheme: light`
is pinned on `:root` so form controls and the canvas behind the page don't go dark on their own.

### Style the scrollbar

The platform default is a grey slab bolted to the right of a warm page — the loudest wrong colour
on screen. Hiding it entirely costs position feedback on a long page. 10px, `--color-rule` thumb,
inset by a transparent border with `background-clip: content-box`.

---

## 2. Type

**Manrope** for display — confirmed by the designer, not inferred from the shapes. Body runs on
the Apple/ChatGPT system stack: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
Inter, system-ui, sans-serif`.

The honest position on the brief "use the font Apple and ChatGPT use": **SF Pro cannot be legally
self-hosted for web**, and ChatGPT's Söhne is a paid licence. The system stack *is* how you get
them — real SF on Apple hardware, Segoe on Windows, Inter as the shipped fallback. Anyone who
tells you they self-hosted SF Pro has a licensing problem.

`tabular-nums` on every wage, rating and counter. `text-wrap: balance` on headings, `pretty` on
paragraphs. Body never below 15px — this audience reads on cheap phones in bright light.

---

## 3. Shape

### 7px, not pills

| Element | Radius |
|---|---|
| chips, stat cells, Available pill | **7px** |
| helper card | 15px |
| results panel | 24px (top-left square under the active first tab) |
| search bar | 44px |
| View Profile, nav pills, circles | full round |

**Only CTAs are fully round.** Making everything a pill was the single change that most made the
build stop looking like the design, and the single fix that most brought it back. It is not a
detail — rounding is most of what a UI's "voice" is.

### Concentric radii

A nested corner must be tighter than its parent or the gap looks wrong. Panel 24 → card 15 →
cells 7. Popover 20 → its rows 13.

---

## 4. The portrait rule

The cut-out portrait breaking above the card header is the most distinctive thing in the product
and the reason the grid doesn't look like every other marketplace.

**Only a real cutout may break the box.** The overflow only works on an actual person:

- an uncut photo brings its background rectangle with it
- a monogram is a plain coloured disc

Either one hanging above the card reads as a bubble stuck to it, not as a person leaning out.
So the photo and monogram branches stay **inside** the header, and the card keeps a clean top
edge until there is a portrait worth breaking it for.

The chain is `cutout_url` → `photo_url` → initials monogram, and a bad photo must never block a
helper from listing or break the grid (`DECISIONS.md` 009).

### Segmentation returns the camera's frame, not a portrait

The card draws the cutout as a 145px square with `object-cover object-top`, which assumes a tight
head-and-shoulders crop. rembg does not give you one: it gives back the **original frame** with
everything but the person erased. The first real upload measured 768×1024 with the subject's
alpha starting 355px down, so the card showed half a box of nothing with a small head in it,
pushed to one side.

Every demo fixture is 500×500 with the subject filling the frame, which is exactly why this
survived a whole round of design review. **Fixtures that are all tidy hide the bug that only
untidy real data finds** — worth remembering for photos, names and wages alike.

The fix is `Imaging.frame_subject`: crop to the alpha bounding box, add a tenth of the subject's
width as headroom, and make the crop square anchored at the top of the head. Cropping belongs at
cutout time and not in CSS, because the card, the account preview and the admin thumbnail all
draw the same file — one framed file is right in all of them, at any size. It also cut the stored
file from 266KB to 104KB.

### The monogram is initials, not art

spell-ui's `fallback-avatar` is a WebGL gradient orb. Lovely component, completely wrong here —
a rainbow sphere where a person's face should be reads as a bug, and against this palette it is
the loudest thing on screen. Warm hues only, low saturation: a grid of fallbacks should read as
one product, not a bag of sweets. Saturation is what makes a placeholder shout.

### Cutout for the card, original for the profile

A cut-out on a full profile page floats with nothing to sit against. The card gets `cutout_url`;
the profile page gets `photo_url`. Both are stored on every upload.

---

## 5. Scroll

### `position: sticky` beats `ScrollTrigger.pin`

GSAP's `pin` freezes an element **where it already is**. For a bar sitting 400px down the page
that means pinning it mid-viewport and leaving a hole behind it. `position: sticky` is what
actually expresses "rise to the top and stay", survives resize, and costs no JavaScript.

Consequence: a sticky element only sticks **within its own parent's box**. The whole page is
rendered *inside* `SiteHeader` for exactly this reason — when the header closed before the
results, the bar scrolled straight past the top and vanished.

### Never animate the height of anything above the scroll position

The hero used to collapse to zero as it faded, to hurry the bar to the top. Removing document
height above the reader makes the browser jerk the scroll position to compensate — a lurch that
made the whole page feel broken, and one that is very hard to attribute to its cause.

Nothing collapses now. The hero scrolls away, the sticky bar arrives on its own, and the timeline
is set to finish exactly then: `end: () => "+=" + bar.offsetTop`.

### GSAP owns layout, React does not

Width, offset and fade were briefly driven by a `setState` inside `onUpdate`. That is a render
round-trip that can simply **not happen** — and when it didn't, the wordmark landed on top of the
first search field. Scroll positions are not state. GSAP writes them directly.

### No smooth-scroll library

Lenis was added, tuned down, and removed. Even at a near-native lerp the page keeps gliding after
the wheel stops and you overshoot what you were reading — the wrong trade on a page whose whole
job is scanning a grid of people. Native scrolling is the better default. Programmatic jumps go
through `scrollTo` in `lib/motion.ts`, which checks reduced-motion per call rather than forcing
`scroll-behavior: smooth` on every anchor in the stylesheet.

### No gooey

`liquid-gooey` fused the wordmark into the search bar. It looked clever and read badly: one
ambiguous object made out of two things that do different jobs — a link home and a search
control. Separated, with a visible 31px gap, both are easier to read and easier to aim at.

*(If you ever do want the effect: `Liquid.Item` paints the merged silhouette **behind** its child
and leaves the DOM crisp on top. The workaround of putting an empty blob inside the filter and
the text over it is unnecessary — that was a misreading of the library.)*

### Motion budget

GSAP for the header morph, `motion` springs for tab switching and popovers, CSS transitions of
150–250ms for everything else — on `transform`, `opacity`, `background-color` or `color`, and
**never** `transition: all`.

---

## 6. Bugs worth never repeating

**`visibility: hidden` still occupies space.** The wordmark pill was `invisible` and in flow, and
it silently stole ~125px from the search bar at rest — the bar rendered 543px inside a 680px
frame. Take it out of flow (`position: absolute`) or use `display: none`.

**`gsap.context` scopes selectors to *descendants*.** `trigger: "[data-morph-scope]"` never
matched, because the scope root is not its own descendant. The trigger silently fell back to the
animation's own targets and the morph half-worked in a way that looked like a timing bug. Pass
the element (`rootRef.current`), not a selector string.

**`leading-none` clips descenders.** "Malayalam" lost the tail of its `y` in a fixed-height stat
cell. Use a real line-height on anything that can contain a descender.

**`white-space: nowrap` inside a `min-w-0` flex parent overflows instead of truncating.** The
search bar's labels printed on top of each other below ~1100px. Nowrap doesn't shrink and doesn't
clip — you need `truncate` (overflow hidden + ellipsis) to actually bound it.

**A wrapping card footer ruins a grid.** Any card with an extra chip wrapped to a second line and
became taller than its neighbours, leaving the row ragged. Force one row, let the least important
element truncate, and pin the footer with `mt-auto` so cards line up regardless of what's above.

**`overflow: hidden` ancestors clip popovers.** The header's collapsing row sliced the profile
dropdown in half. Portal the panel to `document.body` and position it `fixed` from the trigger's
rect — that sidesteps every clipping ancestor at once instead of playing whack-a-mole. It then
has to follow the trigger on scroll and resize, and be pulled back inside the viewport near an
edge.

**`body { overflow-x: hidden }` is a known `position: sticky` hazard.** It works here, but if
sticky ever mysteriously stops, this is the first thing to check. Prefer `.scroll-x` on the
specific wide rows over a global clamp.

**Media URLs need a relative base.** `STORAGE_PUBLIC_BASE` pointed at port 8000 while the API
runs on 8010, so every image 404'd. Root-relative `/media` lets the Vite proxy handle dev and a
CDN handle production.

---

## 7. Component mechanics

### The search bar (Airbnb's model)

1. **Content must not move the layout.** A segment sized by its own text means picking
   "Thiruvananthapuram" shoves the wage toggle sideways and squeezes the submit button off the
   end. Fixed grid fractions; every segment `min-w-0` and truncating. Values change, geometry
   does not.
2. **One shared two-line stack** for every segment — a 12px label on one baseline, a 20px value
   row on the next, wage toggle included. Laying any one out by hand is what put the wage label
   half a line high and let the toggle bulge into it.
3. **A segment is a pill inside a pill.** A square hover fill inside a 44px-radius container looks
   broken at the ends.
4. **Dividers know about their neighbours.** Each hairline fades when either segment it separates
   is hovered or open; an open panel outranks a hover. This is the detail that most makes a bar
   like this read as finished rather than assembled.
5. **The submit button never shrinks.** Being squeezed off the end by a long place name is the
   classic failure of this shape.

### The folder tabs

- **Inverted corners.** A rounded-top cream shape still leaves two hard 90° notches where it meets
  the panel — exactly what makes a tab row look unfinished. Two pseudo-elements (a transparent
  square with one rounded corner, filled by a `box-shadow` spilling cream into the rest) give a
  concave curve that flows tab into panel with no seam.
- **One surface, not eight.** The active fill is a single element with a `layoutId`, so switching
  *slides* it. One object moving reads as one object; two cross-fading reads as a bug.
- **The panel's top-left corner is square only while the first tab is active**, because that tab
  is flush against it. Any other tab, and the corner goes back to round.

### Icons

Drive them from the API where the data already has them (`services[].icon` carries lucide names),
so the row can't drift from the backend.

Two cases for *not* using an exported asset: the frame's star SVG carries
`preserveAspectRatio="none"` on a non-square viewBox, so rendering it square stretches it; and the
frame's verified badge is a bare starburst with nothing inside, which reads as decoration rather
than as a claim about a person. A verification badge should carry a check.

---

## 8. Method

**Measure, don't eyeball.** `get_metadata` for the tree, then `get_design_context` for the node —
that returns exact fills, radii and positions. Sample colours from the PNG export with PIL rather
than reading them off the screen; every hex in section 1 came from a dominant-colour count over a
region, and several were a shade off from what they looked like.

**Verify with DOM measurements, not screenshots.** The Browser pane mis-composited repeatedly
during this build — painting the page into a corner, drawing the sticky bar hundreds of pixels
from where it actually was. Every time, `getBoundingClientRect()` told the truth and the
screenshot didn't. Assert positions and sizes in JavaScript:

```js
const bar = document.querySelector('[data-morph-bar]').getBoundingClientRect();
// barTop === 0 is the assertion, not "it looks stuck"
```

**The designer's screenshots caught what mine couldn't.** Two real bugs — the overlapping search
labels and the ragged card row — were invisible at the 1512px width I was testing and obvious at
theirs. Test the widths people actually use, and take a reported screenshot seriously even when
your own looks fine.

**Where the spec and the guess disagree, the spec wins.** The pre-Figma palette was a reasonable
guess at the brief. The frame is not a guess. Re-sample, don't re-eyeball.

---

## 9. Building the rest of the product

Lessons from round 2 — the pages behind the header menus. Less about pixels, more about the
behaviour that makes a page feel finished.

**Mount a stateful panel once; never render two and hide one.** The helper profile's contact
panel is a sticky rail on desktop and an inline panel on phones. Rendering both and hiding one
with CSS would give it two copies of its state — reveal the phone number in one, and the other
still offers the button. `useMediaQuery` (`lib/dom.ts`) chooses which one to mount.

**Derive the form, don't copy the server into it.** Every edit form holds `draft | null` and shows
`draft ?? serverCopy`. Saving or discarding drops the draft. No effect copies fetched data into
state, so there is no stale form after a refetch and no "reset" code to get wrong. The save bar
appears only while the draft differs from the server copy.

**A component made during render is a new component every render.** `const Icon =
serviceIcon(name)` in a component body reads, to React, as a fresh component type each time —
state inside it resets and the lint rule `react/static-components` flags it. A record lookup
(`SERVICE_ICONS[name] ?? Sparkles`) does not.

**The original photo is for the profile page; the cutout is for the card.** A cut-out on a full
page floats with nothing to sit against. The upload control shows both side by side, because a
helper choosing a photo needs to see both places families will see it.

**Enter sends — except while an input method is composing.** Malayalam keyboards use Enter to
commit a word. Checking `nativeEvent.isComposing` is the difference between a chat that works in
Kerala and one that sends half-words.

**A thread follows the reader down only if they were already at the bottom, or sent the
message.** Someone reading back is never yanked away by a new message. Loading older messages
records the distance from the bottom first and restores it after, so the view does not jump.

**A 402 is an offer; a 409 is not.** The paywall renders as the membership card, never as an
error. But when the *other* person's membership has lapsed the API answers 409, because paying
would not fix someone else's lapse — so that case gets a plain sentence, not a prompt to pay.

**Say what an action does before it does it.** Archive states how many helpers are in the
category. An admin cancel says it ends the membership now, not at the end of the period.
Turning off renewal says the date access actually ends. The confirmation copy is the spec.

---

## 10. Phones

### `overflow-x: hidden` hides the evidence, not the bug

The front page had **168 elements past the right edge at 375px** while every "does the page
scroll sideways?" check came back clean, because `body { overflow-x: hidden }` clips overflow
instead of scrolling it. The primary button on every card was simply not on screen. Measure
`getBoundingClientRect().right` against `document.documentElement.clientWidth` per element, and
compare `window.innerWidth` with `clientWidth`: they differed (468 vs 375), which is the
fingerprint of content stretching the layout viewport.

### A grid column with no `grid-cols` is `auto`, and `auto` cannot shrink

The card's track computed to `435.75px` on a 375px screen. `sm:grid-cols-2` and `xl:grid-cols-3`
expand to `minmax(0,1fr)`, but the phone case had *no* column class, so the single implicit track
was `auto` — floored at the item's min-content width. `grid-cols-1` plus `[&>*]:min-w-0` on the
items is the fix; a grid item's own `min-width: auto` is the second half of the same trap.

### Size components to their container, not the viewport

The same card renders in a 311px phone column, a 252px column on a 640px tablet, a 360px column
in a 3-up desktop grid and a 364px preview sidebar. A tablet gets a *narrower* card than a phone,
so viewport breakpoints cannot express it. `@container/card` with `@max-[393px]` and
`@max-[340px]` overrides can — and writing every rule as an override means that above 393px no
query matches and the Figma render is untouched by construction.

### Never let JavaScript own whether something is on screen

The search sheet animated in with `motion`. In a tab with no animation frames it stayed parked at
its start position: a full-screen overlay off-screen, with the page behind it scroll-locked and
no way back. Its resting position is now plain layout with a CSS entrance animation, so the
worst case is "it appears without sliding". Anything that covers the screen should be correct
with zero JavaScript having run.

### Restore scroll before paint

A single-page app keeps the window's scroll across a route change, so a profile opened from
halfway down the results opens halfway down. Landing at the top is one `useLayoutEffect`; the
harder half is *back*, where restoring after paint clamps to a half-rendered page (1200 became
706). Restoring in a layout effect — after React has committed the new page, before the browser
paints — lands first time.

### The browser pane is hidden, so nothing time-based can be measured in it

`document.visibilityState` is `hidden`: `requestAnimationFrame` never fires and `setTimeout` is
throttled to about a second. Animations, transitions and any retry loop read as "stuck". Layout,
sizes and computed styles are still exact. Measure those; verify motion on a real device, and
suspect the environment before the code when something looks frozen at its initial value.

---

## 11. Round 3, and what measuring signed-in pages found

**The demo accounts can be signed in to from a script.** `POST /auth/phone/start` returns
`dev_code` while `SMS_BACKEND=console`, so the whole signed-in surface — chat, admin, account —
can be measured and exercised without anybody reading a code off a phone. Round 2 left those
pages unmeasured for want of a session; that was never actually necessary.

**And measuring them found the grid trap again.** Admin → Categories stretched a 375px phone to
781px, and the new Skills page to 440px, for exactly the reason in section 10: a `grid gap-6
xl:grid-cols-[...]` has no explicit columns below `xl`, so it is one implicit `auto` track floored
at min-content — and a `truncate` line inside it (the counts and the slug) reports its **full
un-wrapped width** as min-content. `grid-cols-1` plus `[&>*]:min-w-0` fixes both. The rule is
worth stating flatly: *every* responsive grid needs an explicit single-column track below its
breakpoint, and its children need `min-w-0`.

**`documentElement.scrollWidth` lies; try to scroll instead.** On `/admin/users` it reported 880
on a 375px viewport, and the page was perfectly fine — the 860px table was inside its own
`overflow-x-auto` box. The reliable test is to set `scrollingElement.scrollLeft = 500` and read it
back: 0 means a thumb cannot drag the page sideways. `document.body.scrollWidth` is the honest
width when `body { overflow-x: hidden }` is in play. An element-by-element audit also has to
ignore anything inside a scroller that itself fits, or it reports the service tabs as breakage.

**A shared component beats a shared class list.** The chat composer moved into `parts.tsx` when
Ask Sahaya needed one. Its rules — 16px text so iOS does not zoom, `env(safe-area-inset-bottom)`,
Enter that does not send mid-IME-composition — are each one line and each learned the hard way;
two copies would have lost one within a month.

**The assistant's wire shape is worth a test even with no key.** A local `http.server` standing in
for `api.openai.com` pins what we send (`instructions`, `input` with `function_call` /
`function_call_output` pairs, flat function tools, `reasoning: {effort: low}`) and what we parse.
A field name typo would otherwise surface the first time a real key is pasted in. Related: on the
gpt-5 family, reasoning tokens come out of `max_output_tokens`, so a small ceiling at default
effort returns `status: "incomplete"` with no text — which reads as a broken assistant rather than
a configuration problem. Pin the effort low, and treat an empty reply as an error.
