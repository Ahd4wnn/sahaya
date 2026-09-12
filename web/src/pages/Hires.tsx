import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { HandHeart, MessageCircle, Star } from "lucide-react";

import { Avatar } from "@/components/kit/Avatar";
import { Button, ButtonLink } from "@/components/kit/Button";
import { ConfirmDialog, Dialog } from "@/components/kit/Dialog";
import { Field, Segmented, TextArea } from "@/components/kit/Form";
import {
  EmptyState,
  PageShell,
  Skeleton,
  StatusPill,
  Surface,
  type PillTone,
} from "@/components/kit/Surface";
import { useAuth } from "@/features/auth/AuthContext";
import {
  useHireAction,
  useLeaveReview,
  useMyHires,
  type Hire,
  type HireAction,
  type HireStatus,
} from "@/features/hires/queries";
import { useStartConversation } from "@/features/messages/queries";
import { errorMessage } from "@/lib/api";
import { firstName } from "@/lib/format";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Hire requests, from both sides. Backend: hires.py, reviews.py.
 *
 * The state machine lives on the server (TRANSITIONS in hires.py); this page
 * only offers the moves that are legal for this side at this status, so a
 * button is never shown that the API would refuse.
 */

type View = "open" | "done" | "closed";
type Confirmable = Exclude<HireAction, "accept">;

const VIEW_OF: Record<HireStatus, View> = {
  pending: "open",
  accepted: "open",
  completed: "done",
  declined: "closed",
  withdrawn: "closed",
};

function statusPill(hire: Hire): { label: string; tone: PillTone } {
  switch (hire.status) {
    case "pending":
      return {
        label: hire.i_am === "helper" ? "Needs your reply" : "Waiting for reply",
        tone: "warn",
      };
    case "accepted":
      return { label: "Accepted", tone: "good" };
    case "completed":
      return { label: "Completed", tone: "moss" };
    case "declined":
      return { label: "Declined", tone: "neutral" };
    default:
      return { label: "Withdrawn", tone: "neutral" };
  }
}

const CONFIRM: Record<
  Confirmable,
  { title: (name: string) => string; body: string; label: string; danger: boolean }
> = {
  decline: {
    title: (name) => `Decline ${name}'s request?`,
    body: "They are told you are not available. They can send a new request later.",
    label: "Decline",
    danger: true,
  },
  withdraw: {
    title: (name) => `Withdraw your request to ${name}?`,
    body: "They are told you no longer need them. You can send a new request later.",
    label: "Withdraw",
    danger: true,
  },
  complete: {
    title: () => "Mark this job as completed?",
    body: "Do this once the work has been done. You can then both leave a review.",
    label: "Mark completed",
    danger: false,
  },
};

const RATING_WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

function StarPicker({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Rating"
        className="flex gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}, ${RATING_WORDS[n]}`}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="grid size-11 place-items-center rounded-full transition-transform duration-150 hover:scale-110"
          >
            <Star
              aria-hidden
              strokeWidth={1.5}
              className={cn(
                "size-8",
                n <= shown ? "fill-moss text-moss" : "fill-transparent text-ink-faint",
              )}
            />
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mt-1 h-5 text-[14px] font-medium text-ink-muted">
        {RATING_WORDS[shown]}
      </p>
    </div>
  );
}

function ReviewDialog({ hire, onClose }: { hire: Hire; onClose: () => void }) {
  const leave = useLeaveReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const name = firstName(hire.counterpart.full_name);

  function submit() {
    if (!rating) {
      setError("Choose a number of stars.");
      return;
    }
    setError(null);
    leave.mutate(
      { hireId: hire.id, rating, comment: comment.trim() },
      {
        onSuccess: onClose,
        onError: (e) => setError(errorMessage(e, "Your review did not post. Try again.")),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`How was working with ${name}?`}
      description="Reviews are signed with your first name and initial, and cannot be edited later."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={leave.isPending} onClick={submit}>
            Post review
          </Button>
        </>
      }
    >
      <StarPicker value={rating} onChange={setRating} />
      <Field
        className="mt-3"
        label="What was it like? (optional)"
        htmlFor="review-comment"
        error={error}
      >
        <TextArea
          id="review-comment"
          rows={4}
          maxLength={1000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}

function HireRow({ hire, onReview }: { hire: Hire; onReview: () => void }) {
  const navigate = useNavigate();
  const act = useHireAction();
  const start = useStartConversation();
  const [confirm, setConfirm] = useState<Confirmable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const who = hire.counterpart;
  const name = firstName(who.full_name);
  const pill = statusPill(hire);
  const open = hire.status === "pending" || hire.status === "accepted";
  const when = hire.completed_at ?? hire.responded_at ?? hire.created_at;
  const whenLabel = hire.completed_at
    ? "Completed"
    : hire.responded_at
      ? "Answered"
      : "Requested";

  function run(action: HireAction) {
    setError(null);
    act.mutate(
      { id: hire.id, action },
      {
        onSuccess: () => setConfirm(null),
        onError: (e) => {
          setConfirm(null);
          setError(errorMessage(e, "That did not go through. Try again."));
        },
      },
    );
  }

  function message() {
    setError(null);
    start.mutate(
      { user_id: who.user_id },
      {
        onSuccess: (conversation) => navigate(`/messages/${conversation.id}`),
        onError: (e) => setError(errorMessage(e, "Could not open the chat.")),
      },
    );
  }

  return (
    <li className="rounded-[15px] bg-oat p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={who.full_name} photoUrl={who.photo_url} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {who.helper_profile_id ? (
              <Link
                to={`/helpers/${who.helper_profile_id}`}
                className="truncate font-display text-[17px] font-semibold text-ink hover:underline"
              >
                {who.full_name}
              </Link>
            ) : (
              <p className="truncate font-display text-[17px] font-semibold text-ink">
                {who.full_name}
              </p>
            )}
            <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
          </div>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {hire.i_am === "hirer" ? "Helper" : "Family"} · {whenLabel} {shortDate(when)}
          </p>

          {hire.message && (
            <p className="mt-3 whitespace-pre-line rounded-[12px] bg-paper px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">
              {hire.message}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {hire.status === "pending" && hire.i_am === "helper" && (
              <>
                <Button size="sm" busy={act.isPending && !confirm} onClick={() => run("accept")}>
                  Accept
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirm("decline")}>
                  Decline
                </Button>
              </>
            )}
            {hire.status === "pending" && hire.i_am === "hirer" && (
              <Button size="sm" variant="secondary" onClick={() => setConfirm("withdraw")}>
                Withdraw request
              </Button>
            )}
            {hire.status === "accepted" && (
              <Button size="sm" onClick={() => setConfirm("complete")}>
                Mark completed
              </Button>
            )}
            {open && (
              <Button
                size="sm"
                variant="ghost"
                className="hover:bg-paper"
                busy={start.isPending}
                onClick={message}
              >
                <MessageCircle className="size-4" aria-hidden />
                Message {name}
              </Button>
            )}
            {hire.can_review && (
              <Button size="sm" onClick={onReview}>
                <Star className="size-4" aria-hidden />
                Review {name}
              </Button>
            )}
            {hire.my_review_rating !== null && (
              <span className="inline-flex h-9 items-center gap-1.5 text-[13px] text-ink-muted">
                <Star className="size-4 fill-moss text-moss" aria-hidden />
                You rated {name} {hire.my_review_rating} out of 5
              </span>
            )}
          </div>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
          busy={act.isPending}
          title={CONFIRM[confirm].title(name)}
          description={CONFIRM[confirm].body}
          confirmLabel={CONFIRM[confirm].label}
          danger={CONFIRM[confirm].danger}
        />
      )}
    </li>
  );
}

export function Hires() {
  const { user } = useAuth();
  const hires = useMyHires(Boolean(user));
  const [view, setView] = useState<View>("open");
  const [reviewing, setReviewing] = useState<Hire | null>(null);

  const helper = user?.role === "helper";
  const all = hires.data ?? [];
  const rows = all.filter((hire) => VIEW_OF[hire.status] === view);
  const openCount = all.filter((hire) => VIEW_OF[hire.status] === "open").length;
  const toReview = all.filter((hire) => hire.can_review).length;

  return (
    <PageShell
      title={helper ? "Hire requests" : "My hires"}
      subtitle={
        helper
          ? "Families who asked you to work with them, and the jobs you have done."
          : "The helpers you asked, and the jobs that are done."
      }
    >
      <Segmented
        id="hires-view"
        label="Show hires"
        value={view}
        onChange={setView}
        options={[
          { value: "open", label: "Open", count: openCount },
          { value: "done", label: "Done", count: toReview },
          { value: "closed", label: "Closed" },
        ]}
      />

      <Surface className="mt-5">
        {hires.isLoading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : rows.length ? (
          <ul className="space-y-3">
            {rows.map((hire) => (
              <HireRow key={hire.id} hire={hire} onReview={() => setReviewing(hire)} />
            ))}
          </ul>
        ) : view === "open" ? (
          <EmptyState
            icon={HandHeart}
            title="No open requests"
            body={
              helper
                ? "When a family asks you to work with them, it shows up here and in your messages."
                : "Find a helper and tap Request to hire on their profile."
            }
            action={helper ? undefined : <ButtonLink to="/">Browse helpers</ButtonLink>}
          />
        ) : view === "done" ? (
          <EmptyState
            icon={Star}
            title="No finished jobs yet"
            body="Once a job is marked completed it moves here, and you can both leave a review."
          />
        ) : (
          <EmptyState
            icon={HandHeart}
            title="Nothing closed"
            body="Declined and withdrawn requests are kept here for your records."
          />
        )}
      </Surface>

      {reviewing && (
        <ReviewDialog key={reviewing.id} hire={reviewing} onClose={() => setReviewing(null)} />
      )}
    </PageShell>
  );
}
