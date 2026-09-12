import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/kit/Button";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The unsaved-changes bar.
 *
 * It appears only while the form differs from what is saved, so "Save" is
 * never a button that does nothing, and leaving with edits in the form is a
 * visible choice rather than a silent loss.
 */
export function SaveBar({
  visible,
  busy,
  error,
  onSave,
  onDiscard,
}: {
  visible: boolean;
  busy: boolean;
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const reduced = prefersReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduced ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: 24, opacity: 0 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
          className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
        >
          <div
            role="region"
            aria-label="Unsaved changes"
            className="flex w-full max-w-[600px] items-center gap-2 rounded-full bg-paper py-2 pl-5 pr-2 shadow-[var(--shadow-menu)] ring-1 ring-line"
          >
            <p
              role={error ? "alert" : undefined}
              title={error ?? undefined}
              className={cn(
                "min-w-0 flex-1 truncate text-[14px]",
                error ? "text-danger" : "text-ink",
              )}
            >
              {error ?? "You have unsaved changes"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-oat"
              onClick={onDiscard}
              disabled={busy}
            >
              Discard
            </Button>
            <Button size="sm" busy={busy} onClick={onSave}>
              Save changes
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
