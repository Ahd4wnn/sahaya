import { useEffect, useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";

import { Popover } from "@/components/Popover";
import { useDistricts, useTaxonomy, useTowns } from "@/features/helpers/queries";
import type { BrowseFilters, Shift } from "@/features/helpers/types";
import { rupees } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Sort and Filters, the pair on the right of the tab row.
 *
 * Every control here maps onto a query parameter GET /api/v1/helpers already
 * accepts. Nothing is filtered client-side, so a filter can never disagree with
 * the result count beside it.
 */

const SORTS: { value: NonNullable<BrowseFilters["sort"]>; label: string }[] = [
  { value: "rating", label: "Recommended" },
  { value: "wage_low", label: "Wage: low to high" },
  { value: "wage_high", label: "Wage: high to low" },
  { value: "newest", label: "Recently joined" },
];

const SHIFTS: { value: Shift; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "full_day", label: "Full day" },
];

/** Paise. The top stop is open-ended rather than a cap nobody can exceed. */
const WAGE_STOPS = [1_000_000, 1_500_000, 2_000_000, 2_500_000, 0];

function Pill({
  children,
  onClick,
  active,
  count,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className={cn(
        "inline-flex h-11 min-w-0 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] transition-colors duration-200 md:h-10",
        active ? "bg-moss text-on-moss" : "bg-paper text-ink hover:bg-paper/70",
      )}
    >
      {children}
      {count ? (
        <span
          data-numeric
          className={cn(
            "grid size-5 place-items-center rounded-full text-[11px] font-semibold",
            active ? "bg-on-moss text-moss" : "bg-moss text-on-moss",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Toggle({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] transition-colors duration-200",
        selected
          ? "border-moss bg-moss text-on-moss"
          : "border-field bg-transparent text-ink hover:bg-oat",
      )}
    >
      {children}
    </button>
  );
}

export interface FilterBarProps {
  filters: BrowseFilters;
  onChange: (next: BrowseFilters) => void;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const { data: taxonomy } = useTaxonomy();
  const { data: districts } = useDistricts();
  const { data: towns } = useTowns(filters.district);

  // Edits are staged, so half-set filters never fire a request. "Show results"
  // commits; closing the sheet throws the draft away.
  const [draft, setDraft] = useState<BrowseFilters>(filters);
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  // The sheet is a modal on phones. Locking the body is what stops the page
  // behind it scrolling under the user's thumb.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const activeCount = [
    filters.district,
    filters.town,
    filters.live_in ? "y" : "",
    filters.shift,
    filters.wage_max,
    filters.skills?.length ? "y" : "",
  ].filter(Boolean).length;

  const sortLabel =
    SORTS.find((s) => s.value === (filters.sort ?? "rating"))?.label ?? "Recommended";

  const toggleSkill = (slug: string) => {
    const current = draft.skills ?? [];
    setDraft({
      ...draft,
      skills: current.includes(slug)
        ? current.filter((s) => s !== slug)
        : [...current, slug],
    });
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Popover
        role="menu"
        panelClassName="w-[240px]"
        trigger={({ toggle, ...aria }) => (
          <button
            type="button"
            onClick={toggle}
            {...aria}
            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-paper px-4 text-[14px] text-ink transition-colors duration-200 hover:bg-paper/70 md:h-10 md:flex-none md:justify-start"
          >
            <span className="hidden shrink-0 text-ink-muted md:inline">Sort by:</span>
            <span className="truncate">{sortLabel}</span>
          </button>
        )}
      >
        {({ close }) => (
          <div>
            {SORTS.map((sort) => (
              <button
                key={sort.value}
                type="button"
                role="menuitemradio"
                aria-checked={(filters.sort ?? "rating") === sort.value}
                onClick={() => {
                  onChange({ ...filters, sort: sort.value });
                  close();
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left text-[15px] text-ink transition-colors duration-150 hover:bg-oat"
              >
                <span className="flex-1">{sort.label}</span>
                {(filters.sort ?? "rating") === sort.value && (
                  <Check className="size-4 text-moss" aria-hidden />
                )}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <Pill
        onClick={() => setOpen(true)}
        count={activeCount}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
      </Pill>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/30 sm:items-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="filters-title"
            className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[var(--radius-panel)] bg-paper p-5 sm:max-w-[540px] sm:rounded-[var(--radius-panel)]"
          >
            <div className="flex items-center justify-between">
              <h2 id="filters-title" className="font-display text-[20px] font-semibold text-ink">
                Filters
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close filters"
                className="grid size-11 place-items-center rounded-full text-ink-muted hover:bg-oat"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            {/* ------------------------ district ------------------------ */}
            <fieldset className="mt-5">
              <legend className="text-[13px] font-semibold text-ink">District</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                <Toggle
                  selected={!draft.district}
                  onClick={() => setDraft({ ...draft, district: undefined, town: undefined })}
                >
                  All Kerala
                </Toggle>
                {(districts ?? []).map((district) => (
                  <Toggle
                    key={district.slug}
                    selected={draft.district === district.slug}
                    onClick={() =>
                      setDraft({ ...draft, district: district.slug, town: undefined })
                    }
                  >
                    {district.name}
                  </Toggle>
                ))}
              </div>
            </fieldset>

            {draft.district && (towns ?? []).length > 0 && (
              <fieldset className="mt-5">
                <legend className="text-[13px] font-semibold text-ink">Town</legend>
                <div className="scroll-x mt-2 flex max-h-[132px] flex-wrap gap-2 overflow-y-auto">
                  <Toggle
                    selected={!draft.town}
                    onClick={() => setDraft({ ...draft, town: undefined })}
                  >
                    Anywhere
                  </Toggle>
                  {(towns ?? []).map((town) => (
                    <Toggle
                      key={town.slug}
                      selected={draft.town === town.slug}
                      onClick={() => setDraft({ ...draft, town: town.slug })}
                    >
                      {town.name}
                    </Toggle>
                  ))}
                </div>
              </fieldset>
            )}

            {/* -------------------------- skills ------------------------- */}
            <fieldset className="mt-5">
              <legend className="text-[13px] font-semibold text-ink">
                Must be able to
              </legend>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                Every skill you pick has to be on the helper&rsquo;s profile, not just one
                of them.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(taxonomy?.skills ?? []).map((skill) => (
                  <Toggle
                    key={skill.slug}
                    selected={(draft.skills ?? []).includes(skill.slug)}
                    onClick={() => toggleSkill(skill.slug)}
                  >
                    {skill.name}
                  </Toggle>
                ))}
              </div>
            </fieldset>

            {/* -------------------------- shift -------------------------- */}
            <fieldset className="mt-5">
              <legend className="text-[13px] font-semibold text-ink">
                Working hours
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                <Toggle
                  selected={!draft.shift}
                  onClick={() => setDraft({ ...draft, shift: undefined })}
                >
                  Any
                </Toggle>
                {SHIFTS.map((shift) => (
                  <Toggle
                    key={shift.value}
                    selected={draft.shift === shift.value}
                    onClick={() => setDraft({ ...draft, shift: shift.value })}
                  >
                    {shift.label}
                  </Toggle>
                ))}
              </div>
            </fieldset>

            {/* ------------------------- live-in ------------------------- */}
            <fieldset className="mt-5">
              <legend className="text-[13px] font-semibold text-ink">Live-in</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                <Toggle
                  selected={draft.live_in === undefined}
                  onClick={() => setDraft({ ...draft, live_in: undefined })}
                >
                  Either
                </Toggle>
                <Toggle
                  selected={draft.live_in === true}
                  onClick={() => setDraft({ ...draft, live_in: true })}
                >
                  Willing to live in
                </Toggle>
                <Toggle
                  selected={draft.live_in === false}
                  onClick={() => setDraft({ ...draft, live_in: false })}
                >
                  Comes daily
                </Toggle>
              </div>
            </fieldset>

            {/* --------------------------- wage -------------------------- */}
            <fieldset className="mt-5">
              <legend className="text-[13px] font-semibold text-ink">
                Monthly budget
              </legend>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                Shows helpers whose range starts at or below this.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {WAGE_STOPS.map((stop) => (
                  <Toggle
                    key={stop}
                    selected={(draft.wage_max ?? 0) === stop}
                    onClick={() =>
                      setDraft({ ...draft, wage_max: stop === 0 ? undefined : stop })
                    }
                  >
                    {stop === 0 ? "Any budget" : `Up to ₹${rupees(stop)}`}
                  </Toggle>
                ))}
              </div>
            </fieldset>

            <div className="sticky bottom-0 -mx-5 mt-6 flex items-center gap-3 border-t border-line-soft bg-paper px-5 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-4">
              <button
                type="button"
                onClick={() =>
                  setDraft({ sort: draft.sort, service: draft.service })
                }
                className="min-h-11 rounded-full px-4 text-[15px] text-ink-muted underline underline-offset-4 hover:text-ink"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange({ ...draft, offset: 0 });
                  setOpen(false);
                }}
                className="ml-auto inline-flex min-h-11 items-center rounded-full bg-moss px-6 font-display text-[15px] font-medium text-on-moss transition-colors hover:bg-moss-hover"
              >
                Show results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
