# Onboarding Flows

## The pattern

Taken from the Glassdoor and Life Reset flows studied on Mobbin:

- **Segmented progress bar** at the top — the user can see how much is left
- **One decision per screen** — never a wall of fields
- **Back arrow always present** — no trapping
- **~20 seconds per step**
- **Every answer saved on submit**, so a drop-off resumes exactly where it left

## Helper onboarding — 9 steps

This is the flow that must not leak users. A helper who abandons at step 6 is a helper who never
earns through Sahaya.

| # | Screen | Content |
|---|---|---|
| 1 | Role select | The gooey hero: "I want work" / "I want to hire" |
| 2 | Phone OTP | Phone is the **default** path — many helpers have no email |
| 3 | Name + photo | Guided capture (plain wall, shoulders up), then cutout runs, preview shown |
| 4 | Role + skills | One primary role, then multi-select skill chips |
| 5 | Location | District → town → optional landmark |
| 6 | Work terms | Shift chips, hours/day, live-in toggle, monthly wage range |
| 7 | About | Languages, years of experience, short bio |
| 8 | ID documents | **Skippable** — but the Verified badge stays locked until reviewed |
| 9 | Preview → publish | The finished card, then subscribe ₹99 |

### The idea that makes this work

**From step 3 onward, a live preview of the helper's actual card sits beside the form and updates
as they type.**

They are not filling in a form, they are building the thing hirers will see. Each step visibly
improves the card — a skill chip appears, the wage cell fills in, the Live-in badge lights up.

This is the Life Reset "payoff screen" idea, but continuous rather than saved for the end, and it
is the strongest lever we have on completion rate. On mobile the preview collapses to a sticky
mini-card at the top.

### Deliberate choices

- **Photo before skills.** Once someone sees their own face on a real card, they are invested.
  Asking for taxonomy first is a worse hook.
- **ID upload is skippable.** Making it mandatory at signup would cost more helpers than the
  fraud it prevents. The Verified badge is the carrot instead — and the badge is visibly absent
  on their preview card, which is a stronger prompt than a blocking gate.
- **Subscription is last.** They have already built the card and seen it. Asking for ₹99 before
  that is asking a stranger for money.

## Hirer onboarding — 4 steps

Deliberately short. A hirer's value is realised by *seeing helpers*, so get them there fast.

| # | Screen | Content |
|---|---|---|
| 1 | Role select | Same gooey hero |
| 2 | Auth | Google / phone / email — all three equally weighted |
| 3 | Location | District → town, household size |
| 4 | What you need | Service + skills → dropped straight into filtered browse |

**The paywall appears at contact reveal, never before.** They browse real cards, open real
profiles, and only hit ₹99 when they want to actually reach someone. Asking earlier would be
asking them to buy an empty box.

## Resumability

Onboarding progress is a column on the profile row (`onboarding_step`), not client state. A
helper who closes the tab at step 6 and returns on their phone three days later lands on step 6.

## Copy

Plain, warm, second person. Malayalam alongside English on every step label.

- Not "Complete your profile" → **"Let's build your card"**
- Not "Select service category" → **"What work do you do?"**
- Not "Enter expected remuneration" → **"What should you earn each month?"**

Note the last one. Not "what will you accept" — **"what should you earn"**. The product's whole
position is that these workers are underpaid by agencies taking cuts. The copy should not repeat
the assumption that they are price-takers.
