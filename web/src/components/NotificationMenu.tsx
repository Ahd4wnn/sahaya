import { Link } from "react-router";
import { BellOff, MessageCircle, MessagesSquare } from "lucide-react";

import { MenuItem, Popover } from "@/components/Popover";
import { useAuth } from "@/features/auth/AuthContext";
import { NOTIFICATION_ICONS } from "@/features/me/notificationKinds";
import {
  useMarkNotificationsRead,
  useNotifications,
  type NotificationItem,
} from "@/features/me/queries";
import { useUnread } from "@/features/messages/queries";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The second of the two circles: messages and alerts.
 *
 * The badge is one number for both unread alerts and unread messages, from
 * one cheap endpoint (/me/unread). The panel shows the latest alerts; the
 * whole history lives in the pinned Sahaya thread in chat.
 */

function Row({ item, onClick }: { item: NotificationItem; onClick: () => void }) {
  // A lookup rather than a call, so React sees the same component type
  // every render.
  const Icon = NOTIFICATION_ICONS[item.kind] ?? MessageCircle;
  return (
    <Link
      to={item.link || "/messages/sahaya"}
      onClick={onClick}
      className="flex gap-3 rounded-[13px] px-3 py-2.5 transition-colors duration-150 hover:bg-oat"
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
          item.read ? "bg-oat text-ink-faint" : "bg-moss text-on-moss",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14px]",
              item.read ? "text-ink-muted" : "font-semibold text-ink",
            )}
          >
            {item.title}
          </span>
          <span className="shrink-0 text-[12px] text-ink-faint">{ago(item.created_at)}</span>
        </span>
        {item.body && (
          <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ink-muted">
            {item.body}
          </span>
        )}
      </span>
    </Link>
  );
}

export function NotificationMenu({ compact = false }: { compact?: boolean }) {
  const { user, loading } = useAuth();
  const signedIn = Boolean(user);
  const { data } = useNotifications(signedIn, 8);
  const { data: unread } = useUnread(signedIn);
  const markRead = useMarkNotificationsRead();

  const size = compact ? "size-10" : "size-11 md:size-10";
  const alerts = unread?.notifications ?? data?.unread ?? 0;
  const messages = unread?.messages ?? 0;
  const total = alerts + messages;

  if (loading) {
    return <div aria-hidden className={cn("animate-pulse rounded-full bg-paper", size)} />;
  }

  return (
    <Popover
      panelClassName="w-[min(92vw,340px)] max-h-[440px] overflow-y-auto"
      // Opening the panel is the acknowledgement for alerts. Messages stay
      // unread until their conversation is actually opened.
      onOpen={() => {
        if (alerts > 0) markRead.mutate();
      }}
      trigger={({ toggle, ...aria }) => (
        <button
          type="button"
          onClick={toggle}
          {...aria}
          aria-label={total > 0 ? `Messages and alerts, ${total} unread` : "Messages and alerts"}
          className={cn(
            "relative grid shrink-0 place-items-center rounded-full bg-paper text-ink transition-colors duration-200 hover:bg-paper/70",
            size,
          )}
        >
          <MessageCircle className="size-[18px]" aria-hidden strokeWidth={1.75} />
          {total > 0 && (
            <span
              aria-hidden
              data-numeric
              className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-moss px-1 text-[10px] font-semibold leading-[18px] text-on-moss ring-2 ring-oat"
            >
              {total > 9 ? "9+" : total}
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <div>
          <p className="px-3 pb-1 pt-2 font-display text-[15px] font-semibold text-ink">
            Messages &amp; alerts
          </p>

          {!user ? (
            <>
              <p className="px-3 pb-3 pt-1 text-[13px] leading-snug text-ink-muted">
                Sign in to see hire requests and messages.
              </p>
              <MenuItem to="/signin" onClick={close}>
                Sign in
              </MenuItem>
            </>
          ) : (
            <>
              <MenuItem
                icon={MessagesSquare}
                to="/messages"
                onClick={close}
                trailing={
                  messages > 0 && (
                    <span
                      data-numeric
                      className="grid h-5 min-w-5 place-items-center rounded-full bg-moss px-1.5 text-[11px] font-semibold text-on-moss"
                    >
                      {messages}
                      <span className="sr-only"> unread</span>
                    </span>
                  )
                }
              >
                Messages
              </MenuItem>

              <div className="my-1 h-px bg-line-soft" />

              {!data?.items.length ? (
                <div className="px-3 py-6 text-center">
                  <BellOff className="mx-auto size-6 text-ink-faint" aria-hidden />
                  <p className="mt-2 text-[14px] text-ink-muted">
                    Nothing yet. Hire requests and reviews will show up here.
                  </p>
                </div>
              ) : (
                <>
                  {data.items.map((item) => (
                    <Row key={item.id} item={item} onClick={close} />
                  ))}
                  <div className="my-1 h-px bg-line-soft" />
                  <MenuItem to="/messages/sahaya" onClick={close}>
                    See every update
                  </MenuItem>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
