import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The one popover primitive, shared by the profile menu, the alerts panel, the
 * sort menu and the search bar's pickers.
 *
 * Four behaviours a div with an onClick does not give you, and whose absence is
 * what makes a menu feel cheap:
 *
 *   - Escape closes it and returns focus to the trigger
 *   - a click or focus outside closes it
 *   - the trigger reports aria-expanded and owns the panel by id
 *   - the panel is never clipped by an ancestor
 *
 * That last one is why the panel is a portal rather than an absolutely
 * positioned child. The header's top row collapses during the scroll morph via
 * an animated height, which needs `overflow: hidden`, and an in-flow panel gets
 * sliced off by it. Portalling to the body sidesteps every clipping ancestor at
 * once instead of playing whack-a-mole with overflow.
 */

interface Position {
  top: number;
  left: number;
}

export interface PopoverProps {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu" | "dialog" | "listbox";
    "aria-controls": string;
  }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  align?: "start" | "end";
  role?: "menu" | "dialog" | "listbox";
  /** Fired each time the panel opens. */
  onOpen?: () => void;
  /** Fired each time it closes, however it closed. */
  onClose?: () => void;
  className?: string;
  panelClassName?: string;
}

export function Popover({
  trigger,
  children,
  align = "end",
  role = "menu",
  onOpen,
  onClose,
  className,
  panelClassName,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = prefersReducedMotion();
  const id = useId();

  const close = useCallback(
    (restoreFocus = false) => {
      setOpen(false);
      onClose?.();
      if (restoreFocus) rootRef.current?.querySelector("button")?.focus();
    },
    [onClose],
  );

  const toggle = useCallback(() => {
    setOpen((was) => {
      if (was) onClose?.();
      else onOpen?.();
      return !was;
    });
  }, [onOpen, onClose]);

  /**
   * Place the panel under the trigger, then pull it back inside the viewport.
   *
   * A right-aligned menu on a narrow window, or a wide location picker near the
   * left edge, would otherwise hang off the screen where nobody can reach it.
   */
  const place = useCallback(() => {
    const anchor = rootRef.current?.getBoundingClientRect();
    if (!anchor) return;

    const width = panelRef.current?.offsetWidth ?? 260;
    const margin = 8;
    const raw = align === "end" ? anchor.right - width : anchor.left;
    const left = Math.min(
      Math.max(margin, raw),
      window.innerWidth - width - margin,
    );

    setPosition({ top: anchor.bottom + margin, left });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    // The panel is fixed to the viewport, so it has to follow the trigger as
    // the page scrolls beneath it rather than detaching from it.
    const onScrollOrResize = () => place();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, close, place]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {trigger({
        open,
        toggle,
        "aria-expanded": open,
        "aria-haspopup": role,
        "aria-controls": id,
      })}

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              id={id}
              role={role}
              ref={panelRef}
              // Grown from the trigger's edge rather than faded in place: a
              // panel that appears out of nowhere reads as a page change, one
              // that expands from its button reads as the button opening.
              initial={reduced ? false : { opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 520, damping: 38, mass: 0.6 }
              }
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                transformOrigin: align === "end" ? "top right" : "top left",
                // Until the first measurement lands the panel would flash at
                // the top-left corner, so it stays invisible for that frame.
                visibility: position ? "visible" : "hidden",
              }}
              className={cn(
                "fixed z-[200] rounded-[20px] border border-line-soft bg-paper p-2 shadow-[var(--shadow-menu)]",
                panelClassName,
              )}
            >
              {children({ close: () => close(true) })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

/** A row inside a popover. Anything smaller than 44px is not a tap target. */
export function MenuItem({
  icon: Icon,
  children,
  onClick,
  to,
  danger,
  trailing,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  onClick?: () => void;
  to?: string;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  const className = cn(
    "flex min-h-11 w-full items-center gap-3 rounded-[13px] px-3 text-left text-[15px] transition-colors duration-150",
    danger ? "text-danger hover:bg-danger/10" : "text-ink hover:bg-oat",
  );

  const content = (
    <>
      {Icon && <Icon className="size-[18px] shrink-0 text-ink-muted" />}
      <span className="flex-1 truncate">{children}</span>
      {trailing}
    </>
  );

  if (to) {
    return (
      <Link to={to} role="menuitem" onClick={onClick} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" role="menuitem" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
