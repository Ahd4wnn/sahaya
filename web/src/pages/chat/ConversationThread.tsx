import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { MessageCircleOff } from "lucide-react";

import { Avatar } from "@/components/kit/Avatar";
import { Button, ButtonLink } from "@/components/kit/Button";
import { PaywallCard } from "@/components/kit/PaywallCard";
import { EmptyState, Skeleton } from "@/components/kit/Surface";
import {
  sendTyping,
  useConversations,
  useLoadOlder,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useTypingIndicator,
  type ChatMessage,
  type Conversation,
} from "@/features/messages/queries";
import { usePageVisible } from "@/lib/dom";
import { firstName } from "@/lib/format";
import { clockTime, sameDay } from "@/lib/time";
import { BackToList, Bubble, Composer, DayDivider } from "./parts";

/** Messages closer together than this, from the same person, form one group. */
const GROUP_GAP_MS = 5 * 60_000;

let tempCounter = 0;
function tempId() {
  tempCounter += 1;
  return `temp-${Date.now()}-${tempCounter}`;
}

function gap(a: ChatMessage, b: ChatMessage) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/** The meta line under a bubble: what happened to this message. */
function meta(message: ChatMessage, seen: boolean, onRetry: () => void) {
  if (message.failed) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="font-semibold text-danger hover:underline"
      >
        Not sent. Tap to retry
      </button>
    );
  }
  if (message.pending) return "Sending…";
  return (
    <>
      {clockTime(message.created_at)}
      {seen && " · Seen"}
    </>
  );
}

function Thread({ convo }: { convo: Conversation }) {
  const id = convo.id;
  const messages = useMessages(id);
  const older = useLoadOlder(id);
  const send = useSendMessage(id);
  const markRead = useMarkConversationRead();
  const typing = useTypingIndicator(id);
  const visible = usePageVisible();

  const scroller = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const anchor = useRef<number | null>(null);
  const markedFor = useRef<string | null>(null);

  const items = messages.data?.items ?? [];
  const firstId = items[0]?.id;
  const last = items.at(-1);
  const lastId = last?.id;
  const lastMine = last?.mine ?? false;
  const other = convo.other;
  const first = firstName(other.full_name);

  // Read receipts: stamp the thread when there is something unread and the
  // tab can be seen -- once per newest message, so a failed request is not
  // retried in a loop.
  useEffect(() => {
    if (!visible || convo.unread === 0 || !lastId || markedFor.current === lastId) return;
    markedFor.current = lastId;
    markRead.mutate(id);
  }, [visible, convo.unread, lastId, id, markRead]);

  // Older messages were prepended: keep the reader exactly where they were.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || anchor.current === null) return;
    el.scrollTop = el.scrollHeight - anchor.current;
    anchor.current = null;
  }, [firstId]);

  // A new message follows the reader down only if they were already at the
  // bottom, or if they sent it. Someone reading back is never yanked away.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && (pinnedToBottom.current || lastMine)) el.scrollTop = el.scrollHeight;
  }, [lastId, lastMine, typing]);

  function loadOlder() {
    const el = scroller.current;
    if (!firstId || older.isPending) return;
    if (el) anchor.current = el.scrollHeight - el.scrollTop;
    older.mutate(firstId);
  }

  const lastSent = [...items].reverse().find((m) => m.mine && !m.pending && !m.failed);
  const seenId =
    lastSent &&
    convo.other_read_at &&
    new Date(convo.other_read_at).getTime() >= new Date(lastSent.created_at).getTime()
      ? lastSent.id
      : null;

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line-soft px-3 py-3 sm:px-5">
        <BackToList />
        <Avatar name={other.full_name} photoUrl={other.photo_url} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-semibold text-ink">{other.full_name}</p>
          <p className="truncate text-[13px] text-ink-muted">
            {typing ? "typing…" : other.role === "helper" ? "Helper" : "Family"}
          </p>
        </div>
        {other.helper_profile_id && (
          <ButtonLink to={`/helpers/${other.helper_profile_id}`} variant="secondary" size="sm">
            View profile
          </ButtonLink>
        )}
      </header>

      <div
        ref={scroller}
        role="log"
        aria-label={`Conversation with ${other.full_name}`}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6"
      >
        {messages.data?.has_more && (
          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="sm" className="hover:bg-oat" busy={older.isPending} onClick={loadOlder}>
              Load earlier messages
            </Button>
          </div>
        )}

        {messages.isLoading && (
          <div aria-hidden className="mt-auto space-y-3">
            <Skeleton className="h-10 w-2/5 rounded-[18px]" />
            <Skeleton className="ml-auto h-10 w-1/3 rounded-[18px]" />
            <Skeleton className="h-14 w-1/2 rounded-[18px]" />
          </div>
        )}

        {!messages.isLoading && !items.length && (
          <p className="m-auto max-w-[36ch] py-16 text-center text-[14px] leading-relaxed text-ink-muted">
            Say hello to {first}. Messages here are private to the two of you.
          </p>
        )}

        {/* mt-auto keeps a short conversation at the bottom, by the composer. */}
        <div className="mt-auto">
          {items.map((message, index) => {
            const previous = items[index - 1];
            const next = items[index + 1];
            const newDay = !previous || !sameDay(previous.created_at, message.created_at);
            const joinsPrevious =
              Boolean(previous) &&
              !newDay &&
              previous!.mine === message.mine &&
              gap(previous!, message) < GROUP_GAP_MS;
            const joinsNext =
              Boolean(next) &&
              next!.mine === message.mine &&
              sameDay(message.created_at, next!.created_at) &&
              gap(message, next!) < GROUP_GAP_MS;
            const showMeta =
              !joinsNext ||
              Boolean(message.pending || message.failed) ||
              message.id === seenId;
            return (
              <Fragment key={message.id}>
                {newDay && <DayDivider iso={message.created_at} />}
                <Bubble
                  body={message.body}
                  mine={message.mine}
                  joinsPrevious={joinsPrevious}
                  faded={message.pending}
                  meta={
                    showMeta
                      ? meta(message, message.id === seenId, () =>
                          send.mutate({ body: message.body, tempId: message.id }),
                        )
                      : undefined
                  }
                />
              </Fragment>
            );
          })}

          {typing && (
            <div role="status" aria-label={`${first} is typing`} className="mt-3 flex">
              <span className="inline-flex items-center gap-1 rounded-[18px] rounded-bl-[6px] bg-oat px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    aria-hidden
                    style={{ animationDelay: `${i * 160}ms` }}
                    className="size-1.5 animate-pulse rounded-full bg-ink-faint"
                  />
                ))}
              </span>
            </div>
          )}
        </div>
      </div>

      {convo.can_send ? (
        <Composer
          placeholder={`Message ${first}`}
          onTyping={() => sendTyping(id)}
          onSend={(body) => send.mutate({ body, tempId: tempId() })}
        />
      ) : (
        <div className="border-t border-line-soft p-3 sm:p-4">
          {convo.blocked_reason === "you_need_membership" ? (
            <PaywallCard
              compact
              title="Your membership is not active"
              body={`Replying to ${first} needs a ₹99 membership. You can still read everything here.`}
            />
          ) : (
            <p className="rounded-[15px] bg-oat p-4 text-[14px] leading-relaxed text-ink-muted">
              {first}&rsquo;s membership is not active right now, so new messages cannot be
              delivered. They can reply again once it is renewed. You can still read everything
              here.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** A real conversation. Resolved from the conversation list, which is already
 *  loaded for the left pane and carries the send permission and receipts. */
export function ConversationThread({ id }: { id: string }) {
  const conversations = useConversations(true);
  const convo = conversations.data?.find((c) => c.id === id);

  if (conversations.isLoading) {
    return (
      <div aria-hidden className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-4 w-40 rounded-full" />
        </div>
        <div className="mt-auto space-y-3">
          <Skeleton className="h-10 w-2/5 rounded-[18px]" />
          <Skeleton className="ml-auto h-10 w-1/3 rounded-[18px]" />
        </div>
      </div>
    );
  }

  if (!convo) {
    return (
      <div className="m-auto">
        <EmptyState
          icon={MessageCircleOff}
          title="This conversation is not available"
          body="It may have been removed, or the link belongs to another account."
          action={
            <ButtonLink to="/messages" variant="secondary">
              Back to messages
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return <Thread convo={convo} />;
}
