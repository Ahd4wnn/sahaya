import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

import { Button } from "@/components/kit/Button";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Modal surfaces: a centred dialog, and a side sheet for editing.
 *
 * Both portal to the body -- the same lesson as the popovers: an
 * `overflow: hidden` ancestor otherwise clips them. Both lock page scroll,
 * close on Escape and on a backdrop click, move focus in on open and hand it
 * back to whatever opened them on close.
 */

function useModalBehaviour(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the first control, falling back to the panel itself.
    window.requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        "input, textarea, select, button:not([data-dialog-close])",
      );
      (first ?? panelRef.current)?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  return panelRef;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const panelRef = useModalBehaviour(open, onClose);
  const titleId = useId();
  const reduced = prefersReducedMotion();

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          className="fixed inset-0 z-[300] flex items-end justify-center bg-ink/35 p-0 sm:items-center sm:p-4"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 38 }}
            className={cn(
              "max-h-[90dvh] w-full overflow-y-auto rounded-t-[var(--radius-panel)] bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none sm:rounded-[var(--radius-panel)] sm:p-6",
              size === "md" ? "sm:max-w-[460px]" : "sm:max-w-[640px]",
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-[20px] font-semibold tracking-[-0.015em] text-ink">
                  {title}
                </h2>
                {description && (
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">{description}</p>
                )}
              </div>
              <button
                type="button"
                data-dialog-close
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-oat sm:size-10"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {children && <div className="mt-5">{children}</div>}
            {footer && (
              <div className="mt-6 flex flex-col-reverse gap-2 [&>button]:w-full sm:flex-row sm:flex-wrap sm:justify-end sm:[&>button]:w-auto">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Ask before doing something that is hard to undo. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger = false,
  busy = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/** A panel that slides in from the right, for editing one thing in context. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useModalBehaviour(open, onClose);
  const titleId = useId();
  const reduced = prefersReducedMotion();

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          className="fixed inset-0 z-[300] flex justify-end bg-ink/30"
        >
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduced ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: "100%" }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 40 }}
            className="flex h-full w-full max-w-[460px] flex-col bg-paper outline-none sm:rounded-l-[var(--radius-panel)]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-line-soft px-6 py-4">
              <h2 id={titleId} className="font-display text-[19px] font-semibold text-ink">
                {title}
              </h2>
              <button
                type="button"
                data-dialog-close
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 grid size-11 place-items-center rounded-full text-ink-muted transition-colors hover:bg-oat sm:size-10"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && (
              <div className="flex justify-end gap-2 border-t border-line-soft px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
