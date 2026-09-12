import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Page scaffolding for everything that is not the front page.
 *
 * The layering rule from the front page holds here too: oat page, paper
 * panel, and anything inside a panel goes back to oat (docs/design-lessons.md
 * section 1). `Surface` is the paper panel; `Inset` is the oat inside it.
 */

export function PageShell({
  title,
  subtitle,
  actions,
  children,
  width = "default",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: "narrow" | "default" | "wide";
}) {
  return (
    <section
      className={cn(
        "mx-auto w-full px-4 pb-10 pt-8 sm:px-6 sm:pt-10 xl:px-10",
        width === "narrow" && "max-w-[760px]",
        width === "default" && "max-w-[1100px]",
        width === "wide" && "max-w-[1432px]",
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[clamp(1.75rem,3.4vw,2.25rem)] font-bold leading-tight tracking-[-0.025em] text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-ink-muted">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className="mt-7">{children}</div>
    </section>
  );
}

/** The paper panel. Radius 24, the panel step of the concentric scale. */
export function Surface({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
}) {
  return (
    <Tag className={cn("rounded-[var(--radius-panel)] bg-paper p-5 sm:p-7", className)}>
      {children}
    </Tag>
  );
}

/** Oat, inside a paper panel. Radius 15 -- tighter than its parent. */
export function Inset({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[15px] bg-oat p-4", className)}>{children}</div>;
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-[19px] font-semibold tracking-[-0.015em] text-ink">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[14px] leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-12 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-full bg-oat text-ink-muted">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 font-display text-[17px] font-semibold text-ink">{title}</p>
      {body && (
        <p className="mt-1 max-w-[42ch] text-[14px] leading-relaxed text-ink-muted">{body}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export type PillTone = "neutral" | "moss" | "sage" | "good" | "warn" | "bad";

const TONES: Record<PillTone, string> = {
  neutral: "bg-oat text-ink-muted",
  moss: "bg-moss text-on-moss",
  sage: "bg-sage text-paper",
  good: "bg-verified/15 text-verified",
  warn: "bg-[#f3e2c4] text-[#8a5a14]",
  bad: "bg-danger/12 text-danger",
};

/** A status label. 7px radius, like every non-CTA pill in the system. */
export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[7px] px-2 font-display text-[12px] font-semibold leading-none",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A loading placeholder with the footprint of the thing it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-[15px] bg-oat", className)} />;
}
