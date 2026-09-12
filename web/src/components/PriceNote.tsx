import { Link } from "react-router";

import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

/**
 * The price, in the two places it belongs.
 *
 * `PriceNote` is the sentence, used in the footer, so the wording exists once.
 * `GetPremium` is the header's button, which replaced the strip that used to
 * sit under the front page's search bar: a line of price copy directly beneath
 * the thing people came to use was competing with it, and it only ever
 * appeared on the front page. A button in the bar is on every page and asks
 * for nothing until it is clicked.
 */
export function PriceNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-snug text-ink-muted",
        className,
      )}
    >
      <span>
        <strong className="font-display font-semibold text-ink">₹99 a month.</strong> For
        families and for helpers.
      </span>
      <span aria-hidden className="hidden text-ink-faint sm:inline">
        ·
      </span>
      <span>We never take a cut of anyone&rsquo;s salary.</span>
      <Link
        to="/pricing"
        className="inline-flex min-h-11 items-center font-semibold text-moss underline-offset-4 transition-colors hover:text-moss-hover hover:underline"
      >
        See what you get
      </Link>
    </p>
  );
}

/**
 * Get Premium: moss, because it is the one thing in the bar that is an offer.
 *
 * It leads to /pricing rather than opening Razorpay, because what a membership
 * unlocks differs by side and someone signed out needs an account first --
 * /pricing answers both and holds the real checkout button.
 *
 * Hidden for anyone it would insult: a member who already pays, and admins,
 * who have no membership. Below 640px it gives the row to the search bar; the
 * profile menu carries "Get a membership" there.
 */
export function GetPremium({ morph = false }: { morph?: boolean }) {
  const { loading, user, isSubscribed } = useAuth();

  if (loading || isSubscribed || user?.role === "admin") return null;

  return (
    <Link
      to="/pricing"
      {...(morph ? { "data-morph-nav": "" } : {})}
      className="hidden h-10 shrink-0 items-center rounded-full bg-moss px-4 text-[14px] font-semibold text-on-moss transition-colors duration-200 hover:bg-moss-hover sm:inline-flex"
    >
      Get Premium
    </Link>
  );
}
