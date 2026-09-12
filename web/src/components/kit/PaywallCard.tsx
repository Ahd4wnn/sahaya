import { LockKeyhole } from "lucide-react";

import { ButtonLink } from "@/components/kit/Button";
import { cn } from "@/lib/utils";

/**
 * What a 402 renders as. Never an error message: hitting the paywall is an
 * answer, not a failure, and it should read as an offer.
 */
export function PaywallCard({
  title = "₹99 a month unlocks this",
  body,
  compact = false,
  className,
}: {
  title?: string;
  body: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[15px] bg-oat", compact ? "p-4" : "p-5", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-moss text-on-moss">
          <LockKeyhole className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{body}</p>
          <ButtonLink to="/pricing" size="sm" className="mt-3">
            See membership
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
