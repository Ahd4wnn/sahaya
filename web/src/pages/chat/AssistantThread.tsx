import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { MessageSquarePlus, RotateCcw } from "lucide-react";

import { Button } from "@/components/kit/Button";
import { Skeleton } from "@/components/kit/Surface";
import {
  useAskAssistant,
  useAssistant,
  useLoadOlderTurns,
  useResetAssistant,
  useSendProposal,
  type AssistantAction,
  type AssistantTurn,
} from "@/features/assistant/queries";
import { useAuth } from "@/features/auth/AuthContext";
import { errorMessage } from "@/lib/api";
import { clockTime, sameDay } from "@/lib/time";
import { AskMark, BackToList, Bubble, Composer, DayDivider } from "./parts";

/**
 * Ask Sahaya: support, and help finding people.
 *
 * A thread like any other in this page, with one thing that is not: the
 * assistant can offer to start a conversation, and that offer is a card with a
 * button. Tapping it runs POST /conversations and POST .../messages -- the
 * same calls a family makes from a helper's profile -- so the membership gate
 * and the role rules live where they always did, and this page never sends
 * anything on anybody's behalf. See docs/DECISIONS.md 023.
 */

let tempCounter = 0;
function tempId() {
  tempCounter += 1;
  return `temp-${Date.now()}-${tempCounter}`;
}

function Proposal({ action }: { action: AssistantAction }) {
  const send = useSendProposal();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-2 w-full rounded-[15px] border border-line-soft bg-paper p-3">
      <p className="font-display text-[14px] font-semibold text-ink">
        Message {action.helper_name}
        {action.service_name && (
          <span className="font-normal text-ink-muted"> · {action.service_name}</span>
        )}
      </p>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-muted">
        &ldquo;{action.draft}&rdquo;
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          busy={send.isPending}
          onClick={() => {
            setError(null);
            send.mutate(
              { action },
              {
                onSuccess: (conversationId) => navigate(`/messages/${conversationId}`),
                onError: (e) =>
                  setError(errorMessage(e, "That message could not be sent just now.")),
              },
            );
          }}
        >
          <MessageSquarePlus className="size-4" aria-hidden />
          Send and open chat
        </Button>
        <Link
          to={`/helpers/${action.helper_profile_id}`}
          className="inline-flex min-h-9 items-center px-1 text-[13px] font-semibold text-moss hover:underline"
        >
          View profile
        </Link>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}{" "}
          <Link to="/pricing" className="font-semibold underline">
            See membership
          </Link>
        </p>
      )}
    </div>
  );
}

export function AssistantThread() {
  const { user } = useAuth();
  const thread = useAssistant(true);
  const ask = useAskAssistant();
  const older = useLoadOlderTurns();
  const reset = useResetAssistant();
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<number | null>(null);

  const turns = thread.data?.messages ?? [];
  const firstId = turns[0]?.id;
  const lastId = turns.at(-1)?.id;
  const remaining = thread.data?.remaining_today ?? 0;
  const limit = thread.data?.daily_limit ?? 0;

  // Older turns were prepended: keep the reader where they were.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || anchor.current === null) return;
    el.scrollTop = el.scrollHeight - anchor.current;
    anchor.current = null;
  }, [firstId]);

  // Every new turn here is a reply to something this person just typed, so
  // following it down is always what they want.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, ask.isPending]);

  function submit(body: string) {
    setError(null);
    ask.mutate(
      { body, tempId: tempId() },
      {
        onError: (e) =>
          setError(errorMessage(e, "Ask Sahaya could not answer just now. Try again.")),
      },
    );
  }

  function loadOlder() {
    const el = scroller.current;
    if (!firstId || older.isPending) return;
    if (el) anchor.current = el.scrollHeight - el.scrollTop;
    older.mutate(firstId);
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line-soft px-3 py-3 sm:px-5">
        <BackToList />
        <AskMark size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] font-semibold text-ink">Ask Sahaya</p>
          <p className="truncate text-[13px] text-ink-muted">
            {user?.role === "helper"
              ? "Your listing, your hire requests, and how Sahaya works"
              : "Finding people, and how Sahaya works"}
          </p>
        </div>
        {turns.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="hover:bg-oat"
            busy={reset.isPending}
            onClick={() => reset.mutate()}
          >
            <RotateCcw className="size-4" aria-hidden />
            Start over
          </Button>
        )}
      </header>

      <div
        ref={scroller}
        role="log"
        aria-label="Ask Sahaya"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6"
      >
        {thread.data?.has_more && (
          <div className="flex justify-center pb-2">
            <Button
              variant="ghost"
              size="sm"
              className="hover:bg-oat"
              busy={older.isPending}
              onClick={loadOlder}
            >
              Load earlier messages
            </Button>
          </div>
        )}

        {thread.isLoading && (
          <div aria-hidden className="mt-auto space-y-3">
            <Skeleton className="h-14 w-3/5 rounded-[18px]" />
            <Skeleton className="ml-auto h-10 w-1/3 rounded-[18px]" />
          </div>
        )}

        {/* mt-auto keeps a short thread at the bottom, by the composer. */}
        <div className="mt-auto">
          {!thread.isLoading && !turns.length && thread.data && (
            <Bubble body={thread.data.greeting} mine={false} joinsPrevious={false} />
          )}

          {turns.map((turn: AssistantTurn, index) => {
            const previous = turns[index - 1];
            const newDay = !previous || !sameDay(previous.created_at, turn.created_at);
            const mine = turn.role === "user";
            return (
              <Fragment key={turn.id}>
                {newDay && <DayDivider iso={turn.created_at} />}
                <Bubble
                  body={turn.body}
                  mine={mine}
                  joinsPrevious={Boolean(previous) && !newDay && previous!.role === turn.role}
                  faded={turn.pending}
                  meta={
                    turn.failed ? (
                      // Nothing was stored server-side, so asking again is
                      // safe -- it cannot ask the same thing twice.
                      <button
                        type="button"
                        onClick={() => ask.mutate({ body: turn.body, tempId: turn.id })}
                        className="font-semibold text-danger hover:underline"
                      >
                        Not sent. Tap to retry
                      </button>
                    ) : turn.pending ? (
                      "Sending…"
                    ) : (
                      clockTime(turn.created_at)
                    )
                  }
                >
                  {turn.actions.map((action) => (
                    <Proposal key={`${turn.id}-${action.helper_profile_id}`} action={action} />
                  ))}
                </Bubble>
              </Fragment>
            );
          })}

          {ask.isPending && (
            <div role="status" aria-label="Ask Sahaya is thinking" className="mt-3 flex">
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

          {error && (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
      </div>

      {/* A link typed by hand can reach this page on a server with no API key.
          Say so, rather than offering a composer that can only fail. */}
      {thread.data && !thread.data.enabled ? (
        <p className="border-t border-line-soft px-5 py-4 text-center text-[13px] leading-relaxed text-ink-muted">
          Ask Sahaya is not switched on for this site yet.
        </p>
      ) : /* While the thread is still loading `remaining` is 0, which is not
             the same as being out of messages -- so the composer waits for
             real data rather than flashing the cap notice at everybody. */
      !thread.data || remaining > 0 ? (
        <>
          <Composer
            placeholder="Ask about hiring, or anything on Sahaya"
            maxLength={1000}
            disabled={ask.isPending}
            onSend={submit}
          />
          <p className="px-5 pb-3 text-center text-[12px] leading-snug text-ink-faint">
            Ask Sahaya can get things wrong, and never messages anyone without your tap.
            {remaining <= 10 && ` ${remaining} of ${limit} messages left today.`}
          </p>
        </>
      ) : (
        <p className="border-t border-line-soft px-5 py-4 text-center text-[13px] leading-relaxed text-ink-muted">
          You have used today&rsquo;s {limit} messages with Ask Sahaya. It resets tomorrow —
          and you can still message helpers directly.
        </p>
      )}
    </>
  );
}
