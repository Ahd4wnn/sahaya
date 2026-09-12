import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";

/**
 * Where a page starts when you arrive at it.
 *
 * A single-page app keeps the window's scroll position across a route change,
 * so opening a profile from halfway down the results opens it halfway down.
 * React Router's own `ScrollRestoration` only exists for data routers, and this
 * app uses `BrowserRouter`, so this is the equivalent.
 *
 * Three behaviours, in order:
 *
 * 1. **Back and forward restore where you were.** Positions are remembered per
 *    history entry (`location.key`), so browsing helper after helper and coming
 *    back does not restart the grid at the top.
 * 2. **A `#hash` wins** -- `/settings#membership` lands on that section.
 * 3. **Everything else starts at the top**, instantly. Smooth scrolling here
 *    reads as the page sliding away after a tap, and on a long page it is slow.
 *
 * A change to the query string alone is not a navigation to a new page: the
 * front page keeps its filters there, and jumping on every filter change would
 * fight `Landing`, which scrolls to `#results` itself.
 */
export function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const previous = useRef<{ key: string; pathname: string } | null>(null);

  // Before paint, not after: by this point React has committed the new page,
  // so the document already has its height and a restored position lands
  // first time instead of being clamped to a half-rendered page.
  useLayoutEffect(() => {
    // Remember where the page we are leaving was scrolled to.
    const leaving = previous.current;
    if (leaving) positions.current.set(leaving.key, window.scrollY);
    previous.current = { key, pathname };

    // Same page, different query string: not a navigation. Leave it alone.
    if (leaving && leaving.pathname === pathname && navigationType !== "POP") {
      return;
    }

    if (navigationType === "POP") {
      const saved = positions.current.get(key) ?? 0;
      // The page being returned to has not finished rendering, so the document
      // is still short and the browser clamps the scroll to its current height.
      // Ask again a few times as the content lands. A timer rather than an
      // animation frame: a tab restored from the background gets no frames
      // until it is visible, and the position should already be right by then.
      // Bounded by time, not by a number of attempts: the page keeps growing
      // as cached data and images land, and the browser clamps each attempt to
      // the height it has so far. It stops as soon as the position sticks.
      const deadline = Date.now() + 1000;
      const restore = () => {
        window.scrollTo(0, saved);
        if (Math.abs(window.scrollY - saved) > 2 && Date.now() < deadline) {
          window.setTimeout(restore, 32);
        }
      };
      restore();
      return;
    }

    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }
    }

    window.scrollTo(0, 0);
  }, [pathname, hash, key, navigationType]);

  // Browsers restore scroll themselves on reload, which fights the above.
  useEffect(() => {
    if (!("scrollRestoration" in window.history)) return;
    const original = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = original;
    };
  }, []);

  return null;
}
