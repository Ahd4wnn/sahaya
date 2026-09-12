import { initials, monogramTint } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The portrait fallback: initials on a muted tint.
 *
 * spell-ui's fallback-avatar is a WebGL gradient orb. It is a lovely component
 * and completely wrong here -- a rainbow sphere where a person's face should be
 * reads as a bug, and against this palette it is the loudest thing on the page.
 *
 * The tint is derived from the name, so it is stable across renders and varies
 * between people, and the hues are constrained to the warm end so a grid of
 * fallbacks still looks like one product.
 */
export function Monogram({
  name,
  size = 116,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        background: monogramTint(name),
        fontSize: Math.round(size * 0.34),
      }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-display font-semibold leading-none text-on-moss",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
