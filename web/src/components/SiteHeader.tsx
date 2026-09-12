import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { NotificationMenu } from "@/components/NotificationMenu";
import { GetPremium } from "@/components/PriceNote";
import { ProfileMenu } from "@/components/ProfileMenu";
import { MobileSearch } from "@/components/MobileSearch";
import { SearchBar, type SearchValue } from "@/components/SearchBar";
import { useShowBecomeHelper } from "@/features/auth/AuthContext";
import { useNavServices } from "@/features/helpers/queries";
import { gsap, morphEnabled } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The header, the hero, and the morph that joins them.
 *
 * At rest: wordmark, service links, "Become a Helper", two circles; then a
 * centred headline and the search bar below it.
 *
 * On scroll: the headline and nav fade as they leave, the bar reaches the top
 * and sticks, and a separate `sahaya.` pill slides in beside it.
 *
 * ---------------------------------------------------------------------------
 * TWO THINGS THAT WERE WRONG AND ARE WORTH NOT REDOING
 *
 * 1. **Never animate the height of anything above the scroll position.**
 *    The hero used to collapse to zero as it faded, to hurry the bar to the
 *    top. Removing document height above the reader makes the browser jerk the
 *    scroll position to compensate -- a sudden lurch that made the whole page
 *    feel broken. Now nothing collapses: the hero scrolls away and the sticky
 *    bar arrives at the top on its own, and the timeline is set to finish at
 *    exactly that moment.
 *
 * 2. **The wordmark is its own pill, and stays its own pill.** An earlier
 *    version fused it into the bar with a gooey filter. Two distinct objects
 *    with a clear gap between them is easier to read and easier to aim at, and
 *    the wordmark stays a link rather than becoming part of a search control.
 * ---------------------------------------------------------------------------
 *
 * Under reduced motion, or below 768px, none of this exists: no ScrollTrigger,
 * and the bar is a plain sticky element with the wordmark already in place.
 */

// The header nav is admin-managed: Admin -> Categories decides which
// services appear here, in what order, and with what wording.

function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        // Sage ExtraBold, as the frame sets it (node 23:3).
        "font-display text-[22px] font-extrabold leading-none tracking-[-0.03em] text-sage",
        className,
      )}
    >
      sahaya.
    </span>
  );
}

export interface SiteHeaderProps {
  search: SearchValue;
  onSearchChange: (next: SearchValue) => void;
  onSubmit: () => void;
  /**
   * The rest of the page.
   *
   * It is rendered inside this component on purpose. A `position: sticky`
   * element only sticks within its own parent's box, so if the header closed
   * before the results the bar would scroll straight past the top and vanish.
   * Wrapping the page is what gives the bar something to stick inside.
   */
  children: React.ReactNode;
}

export function SiteHeader({
  search,
  onSearchChange,
  onSubmit,
  children,
}: SiteHeaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const nav = useNavServices();
  const showBecomeHelper = useShowBecomeHelper();

  // Whether the morph runs at all is a layout question, so it is re-answered on
  // resize. Crossing 768px rebuilds the timeline rather than leaving a header
  // stranded at a width it was not designed for.
  useEffect(() => {
    const update = () => setEnabled(morphEnabled());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useLayoutEffect(() => {
    if (!enabled || !rootRef.current) return;

    const context = gsap.context(() => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          // The element itself, not a selector string: gsap.context scopes
          // selectors to *descendants* of its root, so "[data-morph-scope]"
          // would never match the root and the trigger would silently fall
          // back to the animation's own targets.
          trigger: rootRef.current,
          start: "top top",
          // The morph lasts exactly as long as the bar's journey to the top.
          // Any shorter and it finishes with the bar still mid-page; any longer
          // and it is still running after the bar has stopped moving.
          end: () => `+=${barRef.current?.offsetTop ?? 320}`,
          scrub: 0.4,
          invalidateOnRefresh: true,
        },
      });

      timeline
        .to("[data-morph-hero]", { y: -32, opacity: 0, ease: "power2.in" }, 0)
        .to("[data-morph-nav]", { y: -12, opacity: 0, ease: "power2.in" }, 0)
        // The wordmark pill slides in from the left and stops short of the bar.
        // The gap is deliberate: two objects, not one.
        .fromTo(
          "[data-morph-brand]",
          { autoAlpha: 0, x: -28, scale: 0.9 },
          { autoAlpha: 1, x: 0, scale: 1, ease: "power3.out" },
          0.15,
        )
        // The pill is out of flow, so the bar has to be pushed clear of it
        // explicitly. 152 = the pill's width plus the gap it keeps.
        .to("[data-morph-form]", { marginLeft: 157, ease: "power3.out" }, 0.15)
        .to("[data-morph-frame]", { maxWidth: 1000, ease: "power2.out" }, 0)
        .fromTo(
          "[data-morph-controls]",
          { autoAlpha: 0, x: 16 },
          { autoAlpha: 1, x: 0, ease: "power2.out" },
          0.35,
        );
    }, rootRef);

    // revert() restores every inline style GSAP wrote, so a rebuild starts from
    // the markup's own values rather than from mid-morph ones.
    return () => context.revert();
  }, [enabled]);

  return (
    <div ref={rootRef} data-morph-scope>
      {/* ------------------------------ top bar ----------------------------- */}
      <div className="mx-auto flex w-full max-w-[1432px] items-center gap-6 px-4 py-5 sm:px-6 xl:px-10">
        <Link to="/" aria-label="Sahaya, home" className="shrink-0">
          <Wordmark />
        </Link>

        <nav
          data-morph-nav
          aria-label="Services"
          className="hidden flex-1 items-center justify-center gap-8 lg:flex"
        >
          {nav.map((item) => (
            <Link
              key={item.slug}
              to={`/?service=${item.slug}`}
              className="text-[15px] font-medium tracking-[-0.005em] text-ink transition-colors duration-200 hover:text-moss"
            >
              {item.nav_label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {showBecomeHelper && (
            <Link
              data-morph-nav
              to="/join?as=helper"
              className="hidden h-10 items-center rounded-full bg-paper px-4 text-[14px] font-medium text-ink transition-colors duration-200 hover:bg-paper/70 sm:inline-flex"
            >
              Become a Helper
            </Link>
          )}
          {/* Fades with the nav as the bar morphs: the scrolled state is the
              search bar's, and a third pill beside it crowded 1024px. */}
          <GetPremium morph />
          <ProfileMenu />
          <NotificationMenu />
        </div>
      </div>

      {/* ------------------------------- hero ------------------------------- */}
      <div
        data-morph-hero
        className="mx-auto w-full max-w-[900px] px-4 pb-6 pt-12 text-center sm:px-6 sm:pt-20"
      >
        <h1 className="font-display text-[clamp(2.25rem,5.4vw,4rem)] font-bold leading-[1.04] tracking-[-0.03em] text-ink">
          Good help, hired directly.
        </h1>
        <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-relaxed text-ink-muted">
          Find the right people to care for your home and the people in it.
          <br />
          For a day. For the everyday. At one place.
        </p>
      </div>

      {/* --------------------------- the search bar -------------------------- */}
      <div
        ref={barRef}
        data-morph-bar
        className="sticky top-0 z-40 w-full bg-oat/90 backdrop-blur-xl"
      >
        <div className="relative mx-auto w-full max-w-[1432px] px-4 py-3 sm:px-6 xl:px-10">
          {/*
            The account and alerts circles follow the bar up.

            The top row scrolls away, and losing the route back to your account
            because you scrolled would be a real regression, so they reappear
            here -- pinned to the right of the page rather than to the bar,
            which is exactly where they were before.
          */}
          {enabled && (
            <div
              data-morph-controls
              className="invisible absolute right-4 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 opacity-0 sm:right-6 xl:right-10"
            >
              <ProfileMenu compact />
              <NotificationMenu compact />
            </div>
          )}

          <div
            data-morph-frame
            className="relative mx-auto flex w-full max-w-[680px] items-center"
          >
            {/*
              The wordmark pill. A separate object with its own background and
              its own gap -- not fused to the bar. It is a link home, and a
              search control is the wrong thing for it to look like part of.

              Absolutely positioned, because `visibility: hidden` still takes up
              space: in flow it stole ~140px from the bar at rest, which is why
              the bar sat narrower than its own max-width. `my-auto` inside
              `inset-y-0` centres it without a transform, leaving `transform`
              free for GSAP.
            */}
            {enabled && (
              <Link
                to="/"
                data-morph-brand
                aria-label="Sahaya, home"
                className="invisible absolute inset-y-0 left-0 z-10 my-auto flex h-[68px] items-center rounded-[var(--radius-search)] bg-paper px-6 opacity-0 shadow-[var(--shadow-raise)] transition-colors duration-200 hover:bg-paper/80"
              >
                <Wordmark />
              </Link>
            )}

            {/* Phones get a 56px pill that opens a full-screen sheet; the
                desktop bar -- and the scroll morph built around it -- starts
                at md, the same line `morphEnabled()` uses. */}
            <MobileSearch
              value={search}
              onChange={onSearchChange}
              onSubmit={onSubmit}
              className="flex-1 md:hidden"
            />
            <SearchBar
              value={search}
              onChange={onSearchChange}
              onSubmit={onSubmit}
              className="hidden min-w-0 flex-1 shadow-[var(--shadow-raise)] md:grid"
            />
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
