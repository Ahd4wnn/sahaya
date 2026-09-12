import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { BellOff } from "lucide-react";

import { EmptyState, Skeleton } from "@/components/kit/Surface";
import { notificationIcon } from "@/features/me/notificationKinds";
import { useMarkNotificationsRead, useNotifications } from "@/features/me/queries";
import { usePageVisible } from "@/lib/dom";
import { clockTime, sameDay } from "@/lib/time";
import { BackToList, DayDivider, SahayaMark } from "./parts";

/**
 * The pinned "Sahaya" thread: every notification, rendered as messages from
 * Sahaya. Notifications stay in their own table (DECISIONS.md 016) -- this is
 * a view of them, so nothing here can drift from the header badge.
 */
export function SahayaThread() {
  const notes = useNotifications(true, 100);
  const markRead = useMarkNotificationsRead();
  const visible = usePageVisible();
  const scroller = useRef<HTMLDivElement>(null);
  const marked = useRef<string | null>(null);

  const items = notes.data?.items ?? [];
  const unread = notes.data?.unread ?? 0;
  const newest = items[0]?.id;
  // Oldest first, like any thread, so the newest update sits by the bottom.
  const ordered = [...items].reverse();

  // Reading the thread is reading the updates -- once per newest item, and
  // only while the tab can actually be seen.
  useEffect(() => {
    if (!visible || unread === 0 || !newest || marked.current === newest) return;
    marked.current = newest;
    markRead.mutate();
  }, [visible, unread, newest, markRead]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line-soft px-3 py-3 sm:px-5">
        <BackToList />
        <SahayaMark size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] font-semibold text-ink">Sahaya</p>
          <p className="truncate text-[13px] text-ink-muted">
            Updates about your hires, reviews and account
          </p>
        </div>
      </header>

      <div
        ref={scroller}
        role="log"
        aria-label="Updates from Sahaya"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      >
        {notes.isLoading ? (
          <div aria-hidden className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 max-w-[480px]" />
            ))}
          </div>
        ) : !ordered.length ? (
          <EmptyState
            icon={BellOff}
            title="No updates yet"
            body="Hire requests, reviews and membership changes will appear here."
          />
        ) : (
          ordered.map((note, index) => {
            const previous = ordered[index - 1];
            const newDay = !previous || !sameDay(previous.created_at, note.created_at);
            const Icon = notificationIcon(note.kind);
            return (
              <Fragment key={note.id}>
                {newDay && <DayDivider iso={note.created_at} />}
                <article className="mt-3 flex max-w-[560px] gap-3">
                  <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-oat text-moss">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 rounded-[18px] rounded-tl-[6px] bg-oat px-4 py-3">
                    <p className="font-display text-[15px] font-semibold text-ink">{note.title}</p>
                    {note.body && (
                      <p className="mt-0.5 whitespace-pre-line text-[14px] leading-relaxed text-ink-muted">
                        {note.body}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <span className="text-[11px] text-ink-faint">{clockTime(note.created_at)}</span>
                      {note.link && (
                        <Link
                          to={note.link}
                          className="text-[13px] font-semibold text-moss hover:underline"
                        >
                          Open
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              </Fragment>
            );
          })
        )}
      </div>

      <p className="border-t border-line-soft px-5 py-3 text-center text-[13px] text-ink-faint">
        This thread is for updates from Sahaya. You cannot reply here.
      </p>
    </>
  );
}
