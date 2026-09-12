import { useMemo, useState } from "react";
import { Check, ChevronLeft, Info, MapPin, Search } from "lucide-react";

import { Popover } from "@/components/Popover";
import { useDistricts, useTaxonomy, useTowns } from "@/features/helpers/queries";
import { cn } from "@/lib/utils";

/**
 * The hero search bar. The reference is Airbnb's, and four things carry it:
 *
 * 1. **Content must not move the layout.** A segment sized by its own text
 *    means picking "Thiruvananthapuram" shoves the wage toggle sideways and
 *    squeezes the submit button off the end. The row is a grid of fixed
 *    fractions; every segment is `min-w-0` and truncates -- including the
 *    labels, which is what stops a long label overflowing its column and
 *    printing on top of the next one.
 * 2. **Every segment is the same two-line stack.** A 12px label on one
 *    baseline, a 20px value row on the next, wage toggle included. Laying any
 *    one of them out by hand is what put the wage label half a line high and
 *    let the toggle bulge out of the row.
 * 3. **A segment is a pill inside a pill.** A square hover fill inside a
 *    44px-radius container looks broken at the ends, so each segment's hover
 *    state is itself a full pill, inset.
 * 4. **Dividers know about their neighbours.** A hairline next to a filled
 *    hover state looks like a mistake, so each divider fades out when either
 *    segment it separates is hovered or open. An open panel outranks a hover,
 *    so the segment you are choosing from stays lit while the pointer wanders.
 *
 * Nothing here knows about scroll. GSAP writes `margin-left` onto this form
 * during the header morph; keeping scroll out is what lets the same component
 * serve the morph, the sticky fallback and the phone layout.
 */

export interface SearchValue {
  district?: string;
  town?: string;
  service?: string;
}

/** Which segment is hovered or open, so the dividers can respond. */
type Segment = "where" | "what" | "wage" | null;

function Divider({ hidden }: { hidden: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "hidden h-8 w-px shrink-0 self-center bg-line transition-opacity duration-200 md:block",
        hidden ? "opacity-0" : "opacity-100",
      )}
    />
  );
}

/**
 * One segment's two lines: a 12px label above a 20px value row.
 *
 * Every segment uses this, the wage toggle included, which is why the three
 * labels share a baseline and the three value rows share the next one.
 */
function FieldStack({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex min-w-0 flex-col items-start justify-center">
      <span className="flex w-full items-center gap-1 truncate text-[12px] font-semibold leading-[16px] text-ink">
        {label}
      </span>
      <span className="flex h-[20px] w-full min-w-0 items-center">
        {children}
      </span>
    </span>
  );
}

function FieldValue({
  value,
  placeholder,
}: {
  value: string;
  placeholder: string;
}) {
  return (
    <span
      className={cn(
        "max-w-full truncate text-[15px] leading-[20px]",
        value ? "text-ink" : "text-ink-faint",
      )}
    >
      {value || placeholder}
    </span>
  );
}

export function OptionRow({
  selected,
  onClick,
  children,
  sub,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left transition-colors duration-150 hover:bg-oat"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{children}</span>
        {sub && (
          <span className="ml block truncate text-[12px] text-ink-faint">
            {sub}
          </span>
        )}
      </span>
      {selected && <Check className="size-4 shrink-0 text-moss" aria-hidden />}
    </button>
  );
}

export interface SearchBarProps {
  value: SearchValue;
  onChange: (next: SearchValue) => void;
  onSubmit: () => void;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  className,
}: SearchBarProps) {
  const { data: districts } = useDistricts();
  const { data: towns } = useTowns(value.district);
  const { data: taxonomy } = useTaxonomy();

  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<Segment>(null);
  const [opened, setOpened] = useState<Segment>(null);

  // An open panel outranks a hover: the segment you are choosing from stays lit
  // even while the pointer wanders over the one next to it.
  const active = opened ?? hovered;

  const districtName =
    districts?.find((d) => d.slug === value.district)?.name ?? "";
  const townName = towns?.find((t) => t.slug === value.town)?.name ?? "";
  const serviceName =
    taxonomy?.services.find((s) => s.slug === value.service)?.name ?? "";
  const locationLabel = townName ? `${townName}, ${districtName}` : districtName;

  const filteredDistricts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return districts ?? [];
    return (districts ?? []).filter((d) => d.name.toLowerCase().includes(q));
  }, [districts, query]);

  const filteredTowns = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return towns ?? [];
    return (towns ?? []).filter((t) => t.name.toLowerCase().includes(q));
  }, [towns, query]);

  /** Shared by all three segments: a pill-shaped hit area, filled when live. */
  const segmentClass = (segment: Segment) =>
    cn(
      "flex min-h-[52px] w-full min-w-0 items-center gap-2 rounded-full px-3 text-left transition-colors duration-200",
      active === segment ? "bg-oat" : "bg-transparent hover:bg-oat/60",
    );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      role="search"
      aria-label="Find help"
      data-morph-form
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "w-full rounded-[var(--radius-search)] bg-paper p-1.5",
        "md:grid md:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,1fr)_auto_auto_auto] md:items-center",
        className,
      )}
    >
      {/* ---------------------------- 1. where ---------------------------- */}
      <Popover
        align="start"
        role="listbox"
        className="min-w-0"
        panelClassName="w-[min(92vw,380px)] max-h-[min(60vh,360px)] overflow-y-auto"
        onOpen={() => setOpened("where")}
        onClose={() => setOpened(null)}
        trigger={({ toggle, ...aria }) => (
          <button
            type="button"
            onClick={toggle}
            onMouseEnter={() => setHovered("where")}
            onFocus={() => setHovered("where")}
            onBlur={() => setHovered(null)}
            {...aria}
            className={segmentClass("where")}
          >
            <MapPin className="size-4 shrink-0 text-ink-muted" aria-hidden />
            <FieldStack label="Where do you need help?">
              <FieldValue value={locationLabel} placeholder="Search Location" />
            </FieldStack>
          </button>
        )}
      >
        {({ close }) => (
          <div>
            <label className="sr-only" htmlFor="location-search">
              Search districts and towns
            </label>
            <input
              id="location-search"
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a district or town"
              className="mb-1 h-11 w-full rounded-full border border-field bg-oat px-4 text-[15px] text-ink outline-none transition-colors duration-150 placeholder:text-ink-faint focus:border-moss"
            />

            {value.district ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...value, district: undefined, town: undefined });
                    setQuery("");
                  }}
                  className="flex min-h-11 w-full items-center gap-1.5 rounded-[13px] px-3 text-[14px] text-moss transition-colors duration-150 hover:bg-oat"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  All 14 districts
                </button>
                <p className="px-3 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
                  Towns in {districtName}
                </p>
                <OptionRow
                  selected={!value.town}
                  onClick={() => {
                    onChange({ ...value, town: undefined });
                    close();
                  }}
                >
                  All of {districtName}
                </OptionRow>
                {filteredTowns.map((town) => (
                  <OptionRow
                    key={town.slug}
                    selected={value.town === town.slug}
                    sub={town.name_ml}
                    onClick={() => {
                      onChange({ ...value, town: town.slug });
                      close();
                    }}
                  >
                    {town.name}
                  </OptionRow>
                ))}
              </>
            ) : (
              <>
                <p className="px-3 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
                  Kerala districts
                </p>
                {filteredDistricts.map((district) => (
                  <OptionRow
                    key={district.slug}
                    selected={value.district === district.slug}
                    sub={district.name_ml}
                    onClick={() => {
                      // Picking a district opens its towns rather than closing:
                      // most people know their town, not just their district.
                      onChange({
                        ...value,
                        district: district.slug,
                        town: undefined,
                      });
                      setQuery("");
                    }}
                  >
                    {district.name}
                  </OptionRow>
                ))}
                {!filteredDistricts.length && (
                  <p className="px-3 py-4 text-[14px] leading-snug text-ink-muted">
                    Nothing matches &ldquo;{query}&rdquo;. Sahaya covers Kerala
                    only for now.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Popover>

      <Divider hidden={active === "where" || active === "what"} />
      <span className="my-1 h-px w-full bg-line-soft md:hidden" aria-hidden />

      {/* ----------------------------- 2. what ---------------------------- */}
      <Popover
        align="start"
        role="listbox"
        className="min-w-0"
        panelClassName="w-[min(92vw,300px)]"
        onOpen={() => setOpened("what")}
        onClose={() => setOpened(null)}
        trigger={({ toggle, ...aria }) => (
          <button
            type="button"
            onClick={toggle}
            onMouseEnter={() => setHovered("what")}
            onFocus={() => setHovered("what")}
            onBlur={() => setHovered(null)}
            {...aria}
            className={segmentClass("what")}
          >
            <FieldStack label="What do you need help with?">
              <FieldValue value={serviceName} placeholder="Select Work" />
            </FieldStack>
          </button>
        )}
      >
        {({ close }) => (
          <div>
            <OptionRow
              selected={!value.service}
              onClick={() => {
                onChange({ ...value, service: undefined });
                close();
              }}
            >
              Any kind of help
            </OptionRow>
            {(taxonomy?.services ?? []).map((service) => (
              <OptionRow
                key={service.slug}
                selected={value.service === service.slug}
                sub={service.name_ml}
                onClick={() => {
                  onChange({ ...value, service: service.slug });
                  close();
                }}
              >
                {service.name}
              </OptionRow>
            ))}
          </div>
        )}
      </Popover>

      <Divider hidden={active === "what" || active === "wage"} />
      <span className="my-1 h-px w-full bg-line-soft md:hidden" aria-hidden />

      {/* --------------------------- 3. wage type -------------------------- */}
      <div
        onMouseEnter={() => setHovered("wage")}
        className="flex min-h-[52px] shrink-0 items-center rounded-full px-3"
      >
        <FieldStack
          label={
            <span id="wage-type-label" className="flex items-center gap-1">
              Wage Type:
              <Info
                className="size-3 shrink-0 text-ink-faint"
                aria-label="Sahaya lists monthly wages only"
              />
            </span>
          }
        >
          {/*
            A segmented control sized to the same 20px value row every other
            segment uses. At its natural height it bulged out of the row and
            collided with its own label.
          */}
          <div
            role="radiogroup"
            aria-labelledby="wage-type-label"
            className="inline-flex h-[20px] shrink-0 items-center rounded-full bg-oat p-[2px]"
          >
            {/*
              Daily is inert on purpose, and not as a UI whim: there is no
              wage_daily column in the schema at all (DECISIONS.md 007).
              Showing it greyed answers the question before someone searches,
              which hiding it would not.
            */}
            <button
              type="button"
              role="radio"
              aria-checked={false}
              disabled
              title="Daily rates are coming soon. Sahaya lists monthly wages only."
              className="flex h-4 cursor-not-allowed items-center rounded-full px-2 text-[11px] font-medium leading-none text-ink-faint"
            >
              Daily
            </button>
            <button
              type="button"
              role="radio"
              aria-checked
              className="flex h-4 items-center rounded-full bg-moss px-2 text-[11px] font-medium leading-none text-on-moss"
            >
              Monthly
            </button>
          </div>
        </FieldStack>
      </div>

      {/* ----------------------------- 4. submit --------------------------- */}
      {/*
        Fixed size, never shrinks. Being squeezed off the end by a long town
        name is the classic failure mode of a bar shaped like this.
      */}
      <button
        type="submit"
        aria-label="Search helpers"
        className="mt-2 grid h-11 w-full shrink-0 place-items-center justify-self-end rounded-full bg-moss text-on-moss transition-colors duration-200 hover:bg-moss-hover md:ml-1 md:mt-0 md:size-[52px] md:w-[52px]"
      >
        <Search className="size-5" aria-hidden />
      </button>
    </form>
  );
}
