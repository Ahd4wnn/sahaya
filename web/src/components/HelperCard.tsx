import { useState } from "react";
import { Link } from "react-router";
import { BadgeCheck, Heart, House, Star } from "lucide-react";

import { Monogram } from "@/components/Monogram";
import type { HelperCardData } from "@/features/helpers/types";
import { availabilityLine, wageRange } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The helper card.
 *
 * Built to the Figma frame node 33:740 ("user 1"), measured rather than
 * eyeballed. The numbers below are that frame's, at its 393px reference width:
 *
 *   card      393x300, radius 15, fill #EDEBE2 (the same oat as the page)
 *   header    111 tall, radius 15 on top only, fill #728156
 *   portrait  145x145, 34px above the card's top edge, 13px from its right
 *   chips     77x22, radius 7, fill #FBF9F1, text #838F6B
 *   cells     49 tall, radius 7, fill #FBF9F1, label #838F6B, value #728156
 *   pill      77x22, radius 7, fill #838F6B
 *   button    129x44, radius 39 (a pill), fill #728156
 *
 * Two things that are easy to get wrong and are load-bearing:
 *
 * 1. **The layering alternates.** Page oat -> paper results panel -> oat
 *    card -> paper chips and cells. The intuitive reading is paper cards on an
 *    oat page, and it is backwards.
 * 2. **The chips, cells and Available pill are 7px rounded, not pills.** Only
 *    View Profile is fully round. Making everything a pill is the single change
 *    that most makes this stop looking like the design.
 *
 * ---------------------------------------------------------------------------
 * **It sizes itself to its container, not to the window.** The same card
 * renders in a 311px phone column, a 252px column on a 640px tablet, a 360px
 * column in a 3-up desktop grid and a 364px preview sidebar -- so the viewport
 * says nothing useful about how much room it has. `@container/card` plus
 * `@max-*` variants is the only tool that reads the box it actually sits in.
 *
 * Everything below is written as "the Figma value, then an override for
 * narrower containers", so at >= 393px **no container query matches and the
 * render is byte-identical to the frame**. Two steps down:
 *
 *   T2, 340-392px  portrait 118, tighter cells, the availability line drops
 *   T3, < 340px    portrait 104, cells stack, the Live-in chip drops
 *
 * The footer stays one row at every size (the alternative, wrapping it, makes
 * cards in the same row different heights). The portrait keeps its overhang
 * ratio at every step, because a cut-out breaking the top edge is the whole
 * design; `container-type: inline-size` contains layout, not paint, so it
 * still overflows freely.
 * ---------------------------------------------------------------------------
 *
 * Two deliberate departures from the frame's exported assets:
 *
 * - **Stars.** The frame's star SVG carries `preserveAspectRatio="none"` on a
 *   14.6x14.0 viewBox, so rendering it into a square box stretches it. Drawn
 *   glyphs at a fixed size stay true, and half-star precision comes free.
 * - **The seal.** The frame's badge is a bare starburst with nothing inside it,
 *   which reads as decoration. A verification badge should say what it means,
 *   so it carries a check -- the same scalloped silhouette, now legible.
 */

const STARS = [0, 1, 2, 3, 4];

function Rating({ avg, count }: { avg: number | null; count: number }) {
  // A helper with no reviews yet gets empty stars rather than a hidden row, so
  // every card is the same height and the grid never ratchets.
  const filled = Math.round(avg ?? 0);
  const label = count
    ? `${avg?.toFixed(1)} out of 5, ${count} review${count === 1 ? "" : "s"}`
    : "No reviews yet";

  return (
    <div className="mt-[3px] flex h-[17px] items-center gap-[6px]" title={label}>
      {/* On the narrowest cards the rating row would reach into the portrait:
          it cannot truncate, and it paints above the image. The label and the
          numeral go; the stars and the aria-label carry the meaning. */}
      <span className="font-display text-[12px] font-medium leading-none text-on-moss-muted @max-[340px]/card:hidden">
        Rating:
      </span>
      <span
        className="flex items-center gap-[3px] @max-[340px]/card:gap-[2px]"
        role="img"
        aria-label={label}
      >
        {STARS.map((i) => (
          <Star
            key={i}
            aria-hidden
            strokeWidth={1.5}
            className={cn(
              "size-[14px] @max-[340px]/card:size-[12px]",
              i < filled
                ? "fill-oat text-oat"
                : "fill-transparent text-on-moss-muted",
            )}
          />
        ))}
      </span>
      {count > 0 && (
        <span
          data-numeric
          className="font-display text-[12px] font-medium leading-none text-on-moss-muted @max-[340px]/card:hidden"
        >
          {avg?.toFixed(1)}
        </span>
      )}
    </div>
  );
}

/**
 * Portrait, with the fallback chain from DECISIONS.md 009.
 *
 * cutout -> original photo -> initials monogram.
 *
 * Only a real cutout breaks the header's top edge -- that overflow is the
 * point of the design, but it only works on an actual person. An uncut photo
 * brings its background rectangle with it and a monogram is a plain coloured
 * disc; either one hanging above the card looks like a bubble stuck to it. So
 * those two stay inside the header, and the card keeps a clean top edge until
 * there is a portrait worth breaking it for.
 *
 * The cutout keeps its 34/145 overhang ratio as it shrinks, so the break reads
 * the same on a phone as on a desktop.
 */
function Portrait({ helper }: { helper: HelperCardData }) {
  const [failed, setFailed] = useState(false);
  const cutout = !failed && helper.cutout_status === "done" && helper.cutout_url;
  const photo = !failed && helper.photo_url;

  if (cutout) {
    return (
      <img
        src={helper.cutout_url!}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="pointer-events-none absolute -top-[34px] right-[13px] size-[145px] object-cover object-top @max-[393px]/card:-top-[28px] @max-[393px]/card:right-[10px] @max-[393px]/card:size-[118px] @max-[340px]/card:-top-[24px] @max-[340px]/card:right-[8px] @max-[340px]/card:size-[104px]"
      />
    );
  }

  if (photo) {
    return (
      <img
        src={helper.photo_url!}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="pointer-events-none absolute bottom-3 right-[13px] size-[84px] rounded-full object-cover ring-2 ring-on-moss/25 @max-[340px]/card:right-[8px] @max-[340px]/card:size-[72px]"
      />
    );
  }

  return (
    <Monogram
      name={helper.full_name}
      size={84}
      className="pointer-events-none absolute bottom-3 right-[13px] ring-2 ring-on-moss/25 @max-[340px]/card:right-[8px]"
    />
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] min-w-[77px] shrink-0 items-center justify-center rounded-[7px] bg-paper px-2 font-display text-[12px] font-semibold leading-none text-sage @max-[393px]/card:min-w-0 @max-[393px]/card:px-[7px]">
      {children}
    </span>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[49px] min-w-0 flex-1 flex-col justify-center rounded-[7px] bg-paper px-[17px] @max-[393px]/card:px-3 @max-[340px]/card:h-[42px] @max-[340px]/card:w-full @max-[340px]/card:flex-none">
      <p className="truncate font-display text-[12px] font-semibold leading-[1.3] text-sage">
        {label}
      </p>
      <p
        data-numeric
        className="truncate font-display text-[14px] font-semibold leading-[1.35] text-moss"
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

export interface HelperCardProps {
  helper: HelperCardData;
  /** Undefined hides the heart entirely -- signed-out visitors get no dead control. */
  saved?: boolean;
  onToggleSave?: (helper: HelperCardData) => void;
}

export function HelperCard({ helper, saved, onToggleSave }: HelperCardProps) {
  const languages = helper.languages.length
    ? helper.languages.join(", ")
    : "Not stated";
  const chips = helper.skills.slice(0, 3);
  const extra = helper.skills.length - chips.length;

  return (
    <article className="@container/card relative flex h-full min-w-0 flex-col rounded-[15px] bg-oat pb-[11px]">
      {/* ---------------------------- moss header ---------------------------- */}
      <header className="relative h-[111px] rounded-t-[15px] bg-moss pl-7 pt-[33px] @max-[340px]/card:pl-4">
        <Portrait helper={helper} />

        {/* The cap is portrait-relative below 393px: a percentage means a
            different number of pixels at every card width, and at 256px 62%
            let the name print across the face. */}
        <div className="relative max-w-[62%] @max-[393px]/card:max-w-[calc(100%-136px)] @max-[340px]/card:max-w-[calc(100%-120px)]">
          <div className="flex items-center gap-[5px]">
            <h3
              className="truncate font-display text-[20px] font-semibold leading-none text-on-moss"
              title={helper.full_name}
            >
              {helper.full_name}
            </h3>
            {helper.id_verified && (
              <BadgeCheck
                className="size-[19px] shrink-0 text-on-moss"
                strokeWidth={2}
                aria-label="ID verified"
              />
            )}
          </div>
          <Rating avg={helper.rating_avg} count={helper.rating_count} />
        </div>
      </header>

      {/* ------------------------------ chip row ------------------------------ */}
      {/* The heart lives here rather than over the header: the header's left is
          the name and its right is the portrait, so anything placed there
          collides with one or the other on a long name. */}
      <div className="flex items-center gap-2 px-3 pt-[13px]">
        {/* Chips scroll sideways inside their own row when they do not fit. The
            fade tells a phone reader there is more, which a silent scroller
            does not. */}
        <div className="scroll-x flex min-w-0 flex-1 gap-1 @max-[393px]/card:[mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-14px),transparent_100%)]">
          {chips.map((skill) => (
            <Chip key={skill.slug}>{skill.name}</Chip>
          ))}
          {extra > 0 && <Chip>+{extra}</Chip>}
          {!chips.length && <Chip>{helper.service_name ?? "Household help"}</Chip>}
        </div>

        {onToggleSave && (
          <button
            type="button"
            onClick={() => onToggleSave(helper)}
            aria-pressed={saved}
            aria-label={
              saved ? "Remove from liked profiles" : "Save to liked profiles"
            }
            className="grid size-11 shrink-0 place-items-center rounded-full text-sage transition-colors duration-200 hover:bg-paper hover:text-moss"
          >
            <Heart
              className={cn("size-[18px]", saved && "fill-moss text-moss")}
              aria-hidden
            />
          </button>
        )}
      </div>

      <div className="mx-3 mt-[14px] h-px bg-rule" />

      {/* ----------------------------- stat cells ----------------------------- */}
      {/* Below 340px they stack: the wage is the card's main scan target and
          ~112px of tabular text does not survive half of a 311px card. */}
      <div className="mt-[13px] flex gap-4 px-3 @max-[393px]/card:gap-2 @max-[340px]/card:flex-col @max-[340px]/card:gap-[7px]">
        <StatCell label="Language:" value={languages} />
        <StatCell
          label="Wage per Month"
          value={wageRange(helper.wage_monthly_min, helper.wage_monthly_max)}
        />
      </div>

      <div className="mx-3 mt-[14px] h-px bg-rule" />

      {/* ------------------------------- footer ------------------------------- */}
      {/* mt-auto pins the footer to the bottom, so cards in a row line up even
          when one has a longer chip row than another. */}
      {/* One row, always -- at every container width. Letting this wrap makes a
          card with a Live-in chip taller than the one beside it and the whole
          grid goes ragged, so instead the pieces give way in order: the
          availability line between 340 and 392 (where it would render "Full
          d..."), then the Live-in chip below 340, which is also on the profile
          page and is a search filter. */}
      <div className="mt-auto flex items-center gap-[10px] px-3 pt-[9px] @max-[340px]/card:gap-2 @max-[340px]/card:px-2.5">
        <span className="inline-flex h-[22px] min-w-[77px] shrink-0 items-center justify-center rounded-[7px] bg-sage px-2 font-display text-[12px] font-semibold leading-none text-paper @max-[393px]/card:min-w-0">
          Available
        </span>

        {helper.willing_to_live_in && (
          <span
            className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[7px] bg-paper px-2 font-display text-[12px] font-semibold leading-none text-sage @max-[340px]/card:hidden"
            title="Willing to live in"
          >
            <House className="size-3" aria-hidden />
            Live-in
          </span>
        )}

        <span
          className="min-w-0 flex-1 truncate font-display text-[12px] font-semibold text-sage @min-[340px]/card:@max-[393px]/card:hidden"
          title={availabilityLine(helper.shifts, helper.hours_per_day)}
        >
          {availabilityLine(helper.shifts, helper.hours_per_day)}
        </span>

        <Link
          to={`/helpers/${helper.id}`}
          className="inline-flex h-[44px] shrink-0 items-center justify-center rounded-full bg-moss px-6 font-display text-[16px] font-semibold text-oat transition-colors duration-200 hover:bg-moss-hover @max-[393px]/card:ml-auto @max-[393px]/card:px-4 @max-[393px]/card:text-[15px] @max-[340px]/card:px-3.5"
        >
          View Profile
          <span className="sr-only"> for {helper.full_name}</span>
        </Link>
      </div>
    </article>
  );
}

/** Same footprint as a real card, so the grid does not jump when data lands.
 *  It is a grid item too, so it needs the same container behaviour -- a
 *  skeleton with a 263px min-content width would re-break the phone column
 *  while the data loads. */
export function HelperCardSkeleton() {
  return (
    <div
      aria-hidden
      className="@container/card min-w-0 animate-pulse rounded-[15px] bg-oat pb-[11px]"
    >
      <div className="h-[111px] rounded-t-[15px] bg-moss/25" />
      <div className="flex gap-1 overflow-hidden px-3 pt-[13px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[22px] w-[77px] shrink rounded-[7px] bg-paper @max-[393px]/card:w-[62px]"
          />
        ))}
      </div>
      <div className="mx-3 mt-[14px] h-px bg-rule" />
      <div className="mt-[13px] flex gap-4 px-3 @max-[393px]/card:gap-2 @max-[340px]/card:flex-col @max-[340px]/card:gap-[7px]">
        <span className="h-[49px] min-w-0 flex-1 rounded-[7px] bg-paper @max-[340px]/card:h-[42px] @max-[340px]/card:w-full @max-[340px]/card:flex-none" />
        <span className="h-[49px] min-w-0 flex-1 rounded-[7px] bg-paper @max-[340px]/card:h-[42px] @max-[340px]/card:w-full @max-[340px]/card:flex-none" />
      </div>
      <div className="mx-3 mt-[14px] h-px bg-rule" />
      <div className="mt-[9px] flex items-center px-3">
        <span className="h-[22px] w-[77px] shrink-0 rounded-[7px] bg-paper @max-[393px]/card:w-[62px]" />
        <span className="ml-auto h-[44px] w-[129px] shrink-0 rounded-full bg-moss/25 @max-[393px]/card:w-[105px] @max-[340px]/card:w-[96px]" />
      </div>
    </div>
  );
}
