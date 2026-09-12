import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, MapPin, Search, X } from "lucide-react";

import { OptionRow, type SearchValue } from "@/components/SearchBar";
import { useDistricts, useTaxonomy, useTowns } from "@/features/helpers/queries";
import { cn } from "@/lib/utils";

/**
 * Search, on a phone.
 *
 * The desktop bar folded down to three stacked segments was 220px tall and
 * lived inside the sticky element, so it held a quarter of the screen while
 * someone scrolled results. Here the sticky footprint is one 56px pill that
 * says what is currently being searched for, and the fields get the whole
 * screen when they are actually needed -- the Airbnb pattern, and the reason
 * the desktop bar exists in the shape it does (docs/design.md 4.3).
 *
 * It reads and writes the same `SearchValue` the desktop bar does, through the
 * same hooks and the same `OptionRow`, so the two can never offer different
 * options or disagree about what is selected. The desktop bar is untouched.
 */

function useNames(value: SearchValue) {
  const { data: districts } = useDistricts();
  const { data: towns } = useTowns(value.district);
  const { data: taxonomy } = useTaxonomy();

  const districtName = districts?.find((d) => d.slug === value.district)?.name ?? "";
  const townName = towns?.find((t) => t.slug === value.town)?.name ?? "";
  const serviceName =
    taxonomy?.services.find((s) => s.slug === value.service)?.name ?? "";

  return {
    districts: districts ?? [],
    towns: towns ?? [],
    services: taxonomy?.services ?? [],
    districtName,
    townName,
    serviceName,
    where: townName ? `${townName}, ${districtName}` : districtName,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line-soft px-4 py-5 last:border-b-0 sm:px-6">
      <h3 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

function SheetBody({
  value,
  onChange,
  onSubmit,
  onClose,
}: {
  value: SearchValue;
  onChange: (next: SearchValue) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { districts, towns, services, districtName, where, serviceName } = useNames(value);
  const [query, setQuery] = useState("");

  const filteredDistricts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? districts.filter((d) => d.name.toLowerCase().includes(q)) : districts;
  }, [districts, query]);

  const filteredTowns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? towns.filter((t) => t.name.toLowerCase().includes(q)) : towns;
  }, [towns, query]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line-soft px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="-ml-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-paper"
        >
          <X className="size-5" aria-hidden />
        </button>
        <h2 className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink">
          Find help
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Where do you need help?">
          <label className="sr-only" htmlFor="sheet-location">
            Search districts and towns
          </label>
          <div className="relative">
            <MapPin
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            />
            <input
              id="sheet-location"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={value.district ? `Towns in ${districtName}` : "Type a district"}
              className="h-12 w-full rounded-full border border-field bg-paper pl-11 pr-4 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-moss"
            />
          </div>

          <div className="mt-2">
            {value.district ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...value, district: undefined, town: undefined });
                    setQuery("");
                  }}
                  className="flex min-h-11 w-full items-center gap-1.5 rounded-[13px] px-3 text-[15px] text-moss transition-colors hover:bg-paper"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  All 14 districts
                </button>
                <OptionRow
                  selected={!value.town}
                  onClick={() => onChange({ ...value, town: undefined })}
                >
                  All of {districtName}
                </OptionRow>
                {filteredTowns.map((town) => (
                  <OptionRow
                    key={town.slug}
                    selected={value.town === town.slug}
                    sub={town.name_ml}
                    onClick={() => onChange({ ...value, town: town.slug })}
                  >
                    {town.name}
                  </OptionRow>
                ))}
              </>
            ) : (
              <>
                {filteredDistricts.map((district) => (
                  <OptionRow
                    key={district.slug}
                    selected={false}
                    sub={district.name_ml}
                    onClick={() => {
                      // Picking a district opens its towns rather than closing:
                      // most people know their town, not just their district.
                      onChange({ ...value, district: district.slug, town: undefined });
                      setQuery("");
                    }}
                  >
                    {district.name}
                  </OptionRow>
                ))}
                {!filteredDistricts.length && (
                  <p className="px-3 py-4 text-[15px] leading-snug text-ink-muted">
                    Nothing matches &ldquo;{query}&rdquo;. Sahaya covers Kerala only for now.
                  </p>
                )}
              </>
            )}
          </div>
        </Section>

        <Section title="What do you need help with?">
          <OptionRow
            selected={!value.service}
            onClick={() => onChange({ ...value, service: undefined })}
          >
            Any kind of help
          </OptionRow>
          {services.map((service) => (
            <OptionRow
              key={service.slug}
              selected={value.service === service.slug}
              sub={service.name_ml}
              onClick={() => onChange({ ...value, service: service.slug })}
            >
              {service.name}
            </OptionRow>
          ))}
        </Section>

        {/* Daily is inert on purpose: there is no daily wage column in the
            schema at all (DECISIONS.md 007). Shown greyed, it answers the
            question before anyone searches. Two 44px rows here, rather than
            the 16px-tall toggle the desktop bar squeezes into its value row. */}
        <Section title="Wage type">
          <div role="radiogroup" aria-label="Wage type" className="space-y-1">
            <button
              type="button"
              role="radio"
              aria-checked
              className="flex min-h-11 w-full items-center justify-between rounded-[13px] bg-paper px-4 text-[15px] font-medium text-ink"
            >
              Monthly
              <Check className="size-4 text-moss" aria-hidden />
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={false}
              disabled
              className="flex min-h-11 w-full cursor-not-allowed items-center justify-between rounded-[13px] px-4 text-[15px] text-ink-faint"
            >
              Daily
              <span className="text-[13px]">Coming soon</span>
            </button>
          </div>
        </Section>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-line-soft bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <button
          type="button"
          onClick={() => {
            onChange({});
            setQuery("");
          }}
          className="min-h-11 shrink-0 rounded-full px-4 text-[15px] text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => {
            onSubmit();
            onClose();
          }}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-moss px-5 font-display text-[16px] font-semibold text-on-moss transition-colors hover:bg-moss-hover"
        >
          <Search className="size-5" aria-hidden />
          {where || serviceName ? "Search" : "Search all of Kerala"}
        </button>
      </div>
    </>
  );
}

export function MobileSearch({
  value,
  onChange,
  onSubmit,
  className,
}: {
  value: SearchValue;
  onChange: (next: SearchValue) => void;
  onSubmit: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { where, serviceName } = useNames(value);
  const summary = [where, serviceName].filter(Boolean).join(" · ");

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-14 w-full items-center gap-3 rounded-full bg-paper px-5 text-left shadow-[var(--shadow-raise)] transition-colors duration-200 active:bg-paper/80"
      >
        <Search className="size-5 shrink-0 text-moss" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15px] font-semibold text-ink">
            {summary || "Where do you need help?"}
          </span>
          <span className="block truncate text-[12px] text-ink-muted">
            {summary ? "Monthly wage · tap to change" : "District, work and monthly wage"}
          </span>
        </span>
      </button>

      {/* The sheet's resting position is plain layout and its entrance is a CSS
          animation (`.sheet-up` in index.css). A JS-driven transform would
          leave this full-screen overlay parked off-screen -- with the page
          behind it scroll-locked -- on any frame clock that stalls. */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Find help"
            className="sheet-up fixed inset-0 z-[200] flex h-dvh flex-col bg-oat"
          >
            <SheetBody
              value={value}
              onChange={onChange}
              onSubmit={onSubmit}
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
