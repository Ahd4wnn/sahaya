import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";

import { FilterBar } from "@/components/FilterBar";
import { HelperCard, HelperCardSkeleton } from "@/components/HelperCard";
import { ServiceTabs } from "@/components/ServiceTabs";
import { SiteHeader } from "@/components/SiteHeader";
import type { SearchValue } from "@/components/SearchBar";
import { useAuth } from "@/features/auth/AuthContext";
import type { BrowseFilters, BrowseResponse } from "@/features/helpers/types";
import { useFavoriteIds, useToggleFavorite } from "@/features/me/queries";
import { api, buildQuery } from "@/lib/api";
import { cn } from "@/lib/utils";
import { scrollTo } from "@/lib/motion";

/**
 * The front page.
 *
 * The Figma frame is not a marketing page above a separate browse page -- it is
 * one scrolling surface: hero, search, tabs, results. Splitting it in two would
 * mean the search bar's morph lands on a page that then has to navigate away,
 * which is exactly the seam the design is built to avoid.
 *
 * Filters live in the URL. A hirer who finds three good cooks in Kakkanad can
 * send that link to their family, and the back button behaves.
 */

const PAGE_SIZE = 12;

function readFilters(params: URLSearchParams): BrowseFilters {
  const skills = params.getAll("skills");
  const wageMax = Number(params.get("wage_max"));
  const liveIn = params.get("live_in");

  return {
    district: params.get("district") ?? undefined,
    town: params.get("town") ?? undefined,
    service: params.get("service") ?? undefined,
    skills: skills.length ? skills : undefined,
    live_in: liveIn === null ? undefined : liveIn === "true",
    shift: (params.get("shift") as BrowseFilters["shift"]) ?? undefined,
    wage_max: Number.isFinite(wageMax) && wageMax > 0 ? wageMax : undefined,
    sort: (params.get("sort") as BrowseFilters["sort"]) ?? "rating",
  };
}

function writeFilters(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.district) params.set("district", filters.district);
  if (filters.town) params.set("town", filters.town);
  if (filters.service) params.set("service", filters.service);
  for (const skill of filters.skills ?? []) params.append("skills", skill);
  if (filters.live_in !== undefined) params.set("live_in", String(filters.live_in));
  if (filters.shift) params.set("shift", filters.shift);
  if (filters.wage_max) params.set("wage_max", String(filters.wage_max));
  if (filters.sort && filters.sort !== "rating") params.set("sort", filters.sort);
  return params;
}

export function Landing() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();

  const filters = useMemo(() => readFilters(params), [params]);

  // The search bar edits a draft; only submitting commits it to the URL. A
  // half-typed location should not refetch on every keystroke.
  const [draft, setDraft] = useState<SearchValue>({
    district: filters.district,
    town: filters.town,
    service: filters.service,
  });
  useEffect(() => {
    setDraft({
      district: filters.district,
      town: filters.town,
      service: filters.service,
    });
  }, [filters.district, filters.town, filters.service]);

  const commit = useCallback(
    (next: BrowseFilters) => {
      setParams(writeFilters(next), { replace: false });
    },
    [setParams],
  );

  const { data: savedIds } = useFavoriteIds(Boolean(user));
  const toggleFavorite = useToggleFavorite();

  const query = useInfiniteQuery({
    queryKey: ["browse", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<BrowseResponse>(
        `/helpers${buildQuery({
          ...(filters as Record<string, unknown>),
          limit: PAGE_SIZE,
          offset: pageParam,
        })}`,
      ),
    getNextPageParam: (last) => {
      const seen = last.offset + last.items.length;
      return seen < last.total ? seen : undefined;
    },
    placeholderData: (previous) => previous,
  });

  const helpers = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  const jumpToResults = useCallback(() => {
    commit({ ...filters, ...draft });
    scrollTo("#results", -80);
  }, [commit, filters, draft]);

  return (
    <>
      <SiteHeader
        search={draft}
        onSearchChange={setDraft}
        onSubmit={jumpToResults}
      >
      {/* ------------------------ tabs and filter row ------------------------ */}
      {/* The price used to sit here, between the search bar and the results.
          It is a header button now (components/PriceNote.tsx) and a footer
          line, so the page under the bar is results and nothing else. */}
      <div className="mx-auto mt-8 w-full max-w-[1432px] px-4 sm:px-6 xl:px-10">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
          <ServiceTabs
            value={filters.service}
            onChange={(service) => commit({ ...filters, service })}
          />
          </div>
          <div className="hidden shrink-0 pb-2 md:block">
            <FilterBar filters={filters} onChange={commit} />
          </div>
        </div>
      </div>

      {/* --------------------------- results panel --------------------------- */}
      <section
        id="results"
        aria-label="Helpers"
        className="mx-auto w-full max-w-[1432px] px-4 sm:px-6 xl:px-10"
      >
        {/*
          The top-left corner is square only while "All Services" is active.

          That first tab sits flush on this corner, so a 24px radius there
          carves a oat-coloured wedge out from under it and breaks the
          illusion that tab and panel are one surface. Every other tab sits
          further along the row, where the tab's own inverted corners handle
          the seam -- and there the panel's corner should be round again,
          because nothing is docked against it.
        */}
        <div
          className={cn(
            "-mt-px rounded-[var(--radius-panel)] bg-paper px-4 py-7 transition-[border-radius] duration-300 sm:px-7 sm:py-9",
            !filters.service && "rounded-tl-none",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {/* Sage, as the frame sets it. Bold rather than semibold: at 20px
                  that makes it WCAG "large text", and sage on paper (3.25:1)
                  clears the 3:1 bar for large text but not 4.5:1 for body. */}
              <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-sage">
                Meet your everyday helpers.
              </h2>
              <p className="mt-0.5 text-[14px] text-ink-muted">
                A helping hand, for whatever life needs.
              </p>
            </div>

            <span
              data-numeric
              className="shrink-0 rounded-full bg-sage px-4 py-2 text-[13px] font-medium text-on-moss"
              aria-live="polite"
            >
              Available Results: {total}
            </span>
          </div>

          {/* Filters live under the tabs on desktop and here on phones, where
              the tab row already owns the full width. */}
          <div className="mt-4 md:hidden">
            <FilterBar filters={filters} onChange={commit} />
          </div>

          {/* The top margin is headroom for the portraits, which break above
              each card's header by ~36px and would otherwise collide with the
              row above the grid. */}
          <div className="mt-11 grid grid-cols-1 gap-x-8 gap-y-[50px] [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
            {query.isPending &&
              Array.from({ length: 6 }, (_, i) => <HelperCardSkeleton key={i} />)}

            {helpers.map((helper) => (
              <HelperCard
                key={helper.id}
                helper={helper}
                saved={savedIds?.has(helper.id) ?? false}
                onToggleSave={
                  user
                    ? (target) =>
                        toggleFavorite.mutate({
                          id: target.id,
                          saved: savedIds?.has(target.id) ?? false,
                        })
                    : undefined
                }
              />
            ))}
          </div>

          {query.isError && (
            <div className="py-16 text-center">
              <p className="text-[15px] text-ink">
                We could not load helpers just now.
              </p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-3 inline-flex min-h-11 items-center rounded-full bg-moss px-5 text-[15px] font-medium text-on-moss hover:bg-moss-hover"
              >
                Try again
              </button>
            </div>
          )}

          {!query.isPending && !query.isError && !helpers.length && (
            <div className="py-16 text-center">
              <SearchX className="mx-auto size-7 text-ink-faint" aria-hidden />
              <p className="mt-3 font-display text-[18px] font-semibold text-ink">
                No one matches that yet.
              </p>
              <p className="mx-auto mt-1 max-w-[380px] text-[14px] text-ink-muted">
                Sahaya is new in some districts. Try widening the location or
                removing a skill.
              </p>
              <button
                type="button"
                onClick={() => commit({ sort: filters.sort })}
                className="mt-4 inline-flex min-h-11 items-center rounded-full bg-moss px-5 text-[15px] font-medium text-on-moss hover:bg-moss-hover"
              >
                Clear filters
              </button>
            </div>
          )}

          {query.hasNextPage && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="inline-flex min-h-11 items-center rounded-full border border-field px-6 text-[15px] font-medium text-ink transition-colors duration-200 hover:bg-oat disabled:opacity-60"
              >
                {query.isFetchingNextPage ? "Loading…" : "Show more helpers"}
              </button>
            </div>
          )}
        </div>
      </section>
      </SiteHeader>
    </>
  );
}
