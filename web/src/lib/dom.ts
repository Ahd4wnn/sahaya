import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept live.
 *
 * For layouts that change *structure*, not just style -- a sticky rail on
 * desktop, an inline panel on phones -- where rendering both and hiding one
 * with CSS would mount the same stateful panel twice.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Whether the tab can be seen. A message only counts as read if someone
 *  could actually have read it. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => document.visibilityState === "visible",
    () => true,
  );
}
