import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Stars, on either ground.
 *
 * Lifted out of HelperCard because the profile pages and the reviews list need
 * the same thing on oat instead of moss. The `tone` prop is the only
 * difference -- everything else, including the "no reviews yet" behaviour, has
 * to stay identical or the same helper appears to have two different ratings.
 *
 * Drawn glyphs rather than the Figma frame's exported SVG: that file carries
 * `preserveAspectRatio="none"` on a 14.6x14.0 viewBox, so rendering it into a
 * square box stretches it. See docs/design-lessons.md section 7.
 */

const STARS = [0, 1, 2, 3, 4];

export interface RatingStarsProps {
  avg: number | null;
  count: number;
  /** "on-moss" for the card header, "on-oat" everywhere else. */
  tone?: "on-moss" | "on-oat";
  size?: number;
  /** The "Rating:" prefix, as the card shows it. */
  showLabel?: boolean;
  /** The numeric average after the stars. */
  showValue?: boolean;
  className?: string;
}

export function RatingStars({
  avg,
  count,
  tone = "on-oat",
  size = 14,
  showLabel = false,
  showValue = true,
  className,
}: RatingStarsProps) {
  // A helper with no reviews yet gets empty stars rather than a hidden row, so
  // every card is the same height and the grid never ratchets.
  const filled = Math.round(avg ?? 0);
  const label = count
    ? `${avg?.toFixed(1)} out of 5, ${count} review${count === 1 ? "" : "s"}`
    : "No reviews yet";

  const onWalnut = tone === "on-moss";
  const muted = onWalnut ? "text-on-moss-muted" : "text-ink-faint";
  const lit = onWalnut ? "fill-oat text-oat" : "fill-moss text-moss";
  const empty = onWalnut ? "text-on-moss-muted" : "text-ink-faint";

  return (
    <div className={cn("flex items-center gap-[6px]", className)} title={label}>
      {showLabel && (
        <span
          className={cn("font-display text-[12px] font-medium leading-none", muted)}
        >
          Rating:
        </span>
      )}

      <span className="flex items-center gap-[3px]" role="img" aria-label={label}>
        {STARS.map((i) => (
          <Star
            key={i}
            aria-hidden
            strokeWidth={1.5}
            style={{ width: size, height: size }}
            className={i < filled ? lit : cn("fill-transparent", empty)}
          />
        ))}
      </span>

      {showValue && count > 0 && (
        <span
          data-numeric
          className={cn("font-display text-[12px] font-medium leading-none", muted)}
        >
          {avg?.toFixed(1)}
        </span>
      )}
    </div>
  );
}
