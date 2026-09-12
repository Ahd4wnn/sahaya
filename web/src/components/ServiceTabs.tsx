import { motion } from "motion/react";
import { LayoutGrid } from "lucide-react";

import type { Service } from "@/features/helpers/types";
import { useTaxonomy } from "@/features/helpers/queries";
import { prefersReducedMotion } from "@/lib/motion";
import { serviceIcon } from "@/lib/serviceIcons";
import { cn } from "@/lib/utils";

/**
 * The folder-tab row that sits on the top edge of the results panel.
 *
 * Two details do the work here:
 *
 * 1. The active tab's paper surface is a single shared element with a
 *    `layoutId`, so switching tabs slides it across rather than snapping it.
 *    One surface moving reads as one object; two surfaces cross-fading reads
 *    as a bug.
 * 2. That surface carries inverted corners (see `.tab-surface` in index.css)
 *    so it flows into the panel below with no 90-degree notch. Without them
 *    the row looks like buttons parked on a box, not tabs cut out of it.
 *
 * The tabs come from the API, and the API is admin-managed (Admin ->
 * Categories): a rename, reorder or archive there changes this row with no
 * deploy. `services` can be passed in instead, which is how the admin page
 * previews an unsaved order with the real component.
 */

export interface ServiceTabsProps {
  value?: string;
  onChange: (service: string | undefined) => void;
  /** Render these instead of the live taxonomy -- for the admin preview. */
  services?: Pick<Service, "slug" | "name" | "icon">[];
  /** Distinct per instance, so two tab rows on one page never share a slide. */
  layoutId?: string;
}

export function ServiceTabs({
  value,
  onChange,
  services: override,
  layoutId = "service-tab-surface",
}: ServiceTabsProps) {
  const { data: taxonomy } = useTaxonomy();
  const reduced = prefersReducedMotion();
  const services = override ?? taxonomy?.services ?? [];

  const tabs = [
    { slug: undefined, name: "All Services", Icon: LayoutGrid },
    ...services.map((service) => ({
      slug: service.slug as string | undefined,
      name: service.name,
      Icon: serviceIcon(service.icon),
    })),
  ];

  return (
    <div
      role="tablist"
      aria-label="Filter by service"
      // The fade tells the reader the row continues. Without it the last tab is
      // cut mid-word at the filter pills and reads as a clipping bug.
      style={{
        maskImage:
          "linear-gradient(to right, #000 calc(100% - 40px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, #000 calc(100% - 40px), transparent 100%)",
      }}
      className="scroll-x flex items-end gap-1 pt-1"
    >
      {tabs.map(({ slug, name, Icon }) => {
        const active = value === slug;
        return (
          <button
            key={slug ?? "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(slug)}
            className="relative flex min-w-[84px] shrink-0 flex-col items-center gap-1.5 px-3.5 pb-3 pt-3.5 outline-offset-[-2px]"
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={layoutId}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 40, mass: 0.7 }
                }
                className="tab-surface absolute inset-0 -z-10"
              />
            )}

            <Icon
              className={cn(
                "size-[19px] transition-colors duration-200",
                active ? "text-moss" : "text-ink-faint",
              )}
              strokeWidth={1.75}
              aria-hidden
            />
            <span
              className={cn(
                "whitespace-nowrap text-[11px] font-medium leading-none transition-colors duration-200",
                active ? "text-ink" : "text-ink-faint",
              )}
            >
              {name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
