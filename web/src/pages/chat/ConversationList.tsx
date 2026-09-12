import type { ReactNode } from "react";
import { Link } from "react-router";
import { Pin } from "lucide-react";

import { Avatar } from "@/components/kit/Avatar";
import { Skeleton } from "@/components/kit/Surface";
import { useAssistant } from "@/features/assistant/queries";
import { useAuth } from "@/features/auth/AuthContext";
import { useNotifications } from "@/features/me/queries";
import { useConversations } from "@/features/messages/queries";
import { useRealtimeConnected } from "@/features/realtime/useRealtime";
import { listTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AskMark, SahayaMark } from "./parts";

function ThreadRow({
  to,
  active,
  avatar,
  title,
  subtitle,
  time,
  unread,
  pinned = false,
}: {
  to: string;
  active: boolean;
  avatar: ReactNode;
  title: string;
  subtitle: string;
  time?: string;
  unread: number;
  pinned?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[15px] px-3 py-2.5 transition-colors duration-150",
        active ? "bg-oat" : "hover:bg-oat/60",
      )}
    >
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-display text-[15px] text-ink",
              unread ? "font-bold" : "font-semibold",
            )}
          >
            {title}
          </span>
          {pinned && <Pin className="size-3.5 shrink-0 text-ink-faint" aria-label="Pinned" />}
          {time && <span className="shrink-0 text-[12px] text-ink-faint">{time}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              unread ? "text-ink" : "text-ink-muted",
            )}
          >
            {subtitle}
          </span>
          {unread > 0 && (
            <span
              data-numeric
              className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-moss px-1.5 text-[11px] font-semibold text-on-moss"
            >
              {unread > 99 ? "99+" : unread}
              <span className="sr-only"> unread</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

/**
 * The left pane: two pinned threads, then real conversations, most recent
 * first. The Sahaya row is built from /me/notifications -- the same source as
 * the header badge -- so the two can never disagree. The Ask Sahaya row exists
 * only when the assistant is configured: with no API key the product looks
 * finished rather than broken.
 */
export function ConversationList({ activeId }: { activeId?: string }) {
  const { user, assistantEnabled } = useAuth();
  const conversations = useConversations(true);
  const notes = useNotifications(true, 50);
  // Not even fetched on a server without a key: the session already said so.
  const assistant = useAssistant(assistantEnabled);
  const live = useRealtimeConnected();
  const latest = notes.data?.items[0];
  const lastTurn = assistant.data?.messages.at(-1);

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Messages</h1>
        <span
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-faint"
          title={
            live
              ? "Connected: new messages arrive instantly."
              : "Reconnecting. Messages still arrive, a little slower."
          }
        >
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", live ? "bg-verified" : "bg-ink-faint")}
          />
          {live ? "Live" : "Reconnecting"}
        </span>
      </header>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        <li>
          <ThreadRow
            to="/messages/sahaya"
            active={activeId === "sahaya"}
            avatar={<SahayaMark />}
            title="Sahaya"
            pinned
            subtitle={latest?.title ?? "Updates about your hires and account"}
            time={latest ? listTime(latest.created_at) : undefined}
            unread={notes.data?.unread ?? 0}
          />
        </li>

        {assistant.data?.enabled && (
          <li>
            <ThreadRow
              to="/messages/assistant"
              active={activeId === "assistant"}
              avatar={<AskMark />}
              title="Ask Sahaya"
              pinned
              subtitle={
                lastTurn
                  ? lastTurn.role === "user"
                    ? `You: ${lastTurn.body}`
                    : lastTurn.body
                  : user?.role === "helper"
                    ? "Questions about your listing or membership"
                    : "Help finding people, and how Sahaya works"
              }
              time={lastTurn ? listTime(lastTurn.created_at) : undefined}
              unread={0}
            />
          </li>
        )}

        {conversations.isLoading &&
          [0, 1, 2].map((i) => (
            <li key={i} aria-hidden className="flex items-center gap-3 px-3 py-2.5">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2 rounded-full" />
                <Skeleton className="h-3 w-3/4 rounded-full" />
              </div>
            </li>
          ))}

        {conversations.data?.map((conversation) => (
          <li key={conversation.id}>
            <ThreadRow
              to={`/messages/${conversation.id}`}
              active={activeId === conversation.id}
              avatar={
                <Avatar
                  name={conversation.other.full_name}
                  photoUrl={conversation.other.photo_url}
                  size={44}
                />
              }
              title={conversation.other.full_name}
              subtitle={
                conversation.last_message
                  ? conversation.last_message_mine
                    ? `You: ${conversation.last_message}`
                    : conversation.last_message
                  : "No messages yet"
              }
              time={
                conversation.last_message_at ? listTime(conversation.last_message_at) : undefined
              }
              unread={conversation.unread}
            />
          </li>
        ))}

        {conversations.data && !conversations.data.length && (
          <li className="px-3 pt-3 text-[13px] leading-relaxed text-ink-muted">
            {user?.role === "helper"
              ? "When a family messages you, the conversation appears here."
              : "Open a helper's profile and tap Message to start a conversation."}
          </li>
        )}
      </ul>
    </>
  );
}
