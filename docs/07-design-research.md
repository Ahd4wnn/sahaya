# Design Research

Collected from Mobbin, plus Airbnb's published design language and Apple HIG. Each entry records
**what we take**, not just what it is.

## The palette anchor

**[Function Health — membership pricing](https://mobbin.com/sites/sections/f5d5c740-7af0-4718-9893-3b8e80e39eed)**
Cream ground, serif display headline with an italic accent, thin rules, generous whitespace,
terracotta CTA, check-mark feature list.

*Take:* essentially the entire visual direction. The cream/rust/serif combination is what makes
warm neutrals read as premium and editorial rather than as a default beige. Also the pricing card
anatomy — big price, feature list beside it, one strong CTA.

**Independent validation:** warm neutrals in the `#F5F0EB`–`#E8E0D5` range are the current
convention in home services and healthcare *because* they signal stability and trust. This is not
just a taste call — it is the right register for asking strangers to trust each other in homes.

## Marketplace mechanics

**[Airbnb — listing detail](https://mobbin.com/screens/0c43c484-091f-41b7-a41c-df660291490f)**
Sticky right-rail booking card that follows the scroll while content moves past it. Host block
with Superhost badge. Highlight rows with icons. Sectioned amenities.

*Take:* the sticky rail becomes our **Request hire** panel — same anatomy, same behaviour, same
collapse-to-bottom-bar on mobile. The highlight rows become our verification and experience rows.

**[Airbnb — search results](https://mobbin.com/screens/6b11529b-ae42-4704-8b50-5dd155d33bdf)**
Card grid with a Guest-favourite pill, saved-heart, rating inline with the title.

*Take:* card-first browse, badge pill, inline rating. Not the map split — Kerala hiring is
district/town-based, and a map would imply a precision we do not have.

**[Braintrust — talent browse](https://mobbin.com/screens/04c74b55-a789-4d52-8957-248cd53d942d)**
Horizontal filter-chip row above a two-column card grid; skills as tags on each card; rate
prominent; a status pill.

*Take:* the filter chip row (district, town, skill, wage, shift, live-in) and skill tags on cards.

**[Care.com — caregiver profile](https://mobbin.com/screens/41f22041-1b75-4dd1-a336-01069df559cc)**
Left rail with photo, an experience/rate/response-time stat trio, credential checklist, and an
explicit line stating the platform does **not** verify credentials.

*Take:* the stat trio directly — it became our three-cell stats row. And the honesty: we state
plainly what Verified ID does and does not mean. Over-claiming verification on a platform placing
strangers in homes is the fastest way to destroy trust after one bad incident.

**[Care.com — browse](https://mobbin.com/screens/f5a2f425-cc06-4022-ac37-1587cb49d91f)**
A locality-scoped carousel with hired-by-neighbours social proof.

*Take:* the locality-scoped heading pattern — "Cooks in Kakkanad" beats "Search results".

## Onboarding

**[Glassdoor — account setup](https://mobbin.com/flows/e389958b-9242-4795-84ad-9908a2ddec2b)**
Segmented progress bar, back arrow, one question per screen, illustration above the question,
disabled primary button until the step is valid.

*Take:* the whole skeleton of both onboarding flows.

**[Life Reset — profile setup](https://mobbin.com/flows/e91bc9a4-db92-449a-8de2-2d5e81381f6b)**
Progress bar, single decision per screen, and a **summary payoff screen** that reflects the
user's answers back at them before asking for commitment.

*Take:* the payoff idea — but made *continuous*. Instead of one reward screen at the end, the
helper's real card sits beside the form from step 3 and improves with every answer. See
`08-onboarding-flows.md`.

## The card

The user's reference: warm yellow header panel, name and role, **portrait cut out and breaking
above the panel's top edge**, chip row, three stat cells, footer with availability and a CTA.

*Take:* all of it except the voice note. The breaking-the-box portrait is the single most
distinctive thing in the design and the reason the browse grid will not look like every other
marketplace. Implementation notes and the failure mode are in `06-design-system.md`.

## Airbnb DLS principles

*Unified, Universal, Iconic, Conversational.* The mechanic worth stealing is the restraint:
**one typeface, one accent, soft shapes, photo-led depth.** Airbnb's system is disciplined, not
elaborate — exactly the corrective needed when three animation libraries are on hand.

## Apple HIG

Clarity, deference, depth. Content first and chrome minimal; translucent blurred nav with content
scrolling beneath; depth through layering rather than heavy shadows; 44pt minimum hit targets;
`prefers-reduced-motion` honoured throughout.

## What we deliberately did not take

- **Dark hero sections** (Reflect, Fey). Beautiful, wrong register — this audience needs warm and
  approachable, not nocturnal SaaS.
- **Map-based search** (Airbnb). Implies location precision we do not have and do not want; a
  helper's exact address is not public data.
- **Voice notes** (the reference card). Explicitly out of scope.
- **Gradient meshes and glow.** Banned by the craft rules and wrong for the palette.
