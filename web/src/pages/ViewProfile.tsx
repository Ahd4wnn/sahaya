import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  BadgeCheck,
  HandHeart,
  House,
  Mail,
  MessageCircle,
  Phone,
  SearchX,
  ShieldCheck,
} from "lucide-react";

import { Monogram } from "@/components/Monogram";
import { RatingStars } from "@/components/RatingStars";
import { ReviewList } from "@/components/ReviewList";
import { Button, ButtonLink } from "@/components/kit/Button";
import { Dialog } from "@/components/kit/Dialog";
import { Field, TextArea } from "@/components/kit/Form";
import { PaywallCard } from "@/components/kit/PaywallCard";
import {
  EmptyState,
  PageShell,
  SectionHeading,
  Skeleton,
  StatusPill,
  Surface,
} from "@/components/kit/Surface";
import { useAuth } from "@/features/auth/AuthContext";
import { useHelper, useHelperMe } from "@/features/helpers/queries";
import type { HelperDetailData } from "@/features/helpers/types";
import { useHelperReviews, useRequestHire } from "@/features/hires/queries";
import { useStartConversation } from "@/features/messages/queries";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useMediaQuery } from "@/lib/dom";
import { availabilityLine, experienceLabel, firstName, wageRange } from "@/lib/format";
import { scrollTo } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A helper's public profile.
 *
 * The photo here is the **original**, not the cutout: a cut-out on a full page
 * floats with nothing to sit against, and families deciding whether to let
 * someone into their home want to see the actual photograph. The cutout
 * belongs to the card (docs/design-lessons.md section 4).
 *
 * The contact panel is a sticky rail on desktop, the Airbnb mechanic, and an
 * inline panel with a slim bottom bar on phones. It is mounted once or the
 * other -- never both -- so its state (revealed contact, open dialog) is never
 * split across two copies.
 */

interface Contact {
  phone: string | null;
  email: string | null;
}

type Notice = { tone: "paywall" | "sent" | "error"; text: string };

function Portrait({ helper }: { helper: HelperDetailData }) {
  const [failed, setFailed] = useState(false);

  if (helper.photo_url && !failed) {
    return (
      <img
        src={helper.photo_url}
        alt={`Photo of ${helper.full_name}`}
        onError={() => setFailed(true)}
        className="aspect-[4/5] w-full max-w-[240px] rounded-[15px] bg-oat object-cover object-top"
      />
    );
  }
  return (
    <div className="grid aspect-[4/5] w-full max-w-[240px] place-items-center rounded-[15px] bg-oat">
      <Monogram name={helper.full_name} size={104} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-oat px-4 py-3">
      <p className="text-[12px] font-semibold text-ink-muted">{label}</p>
      <p data-numeric className="mt-0.5 font-display text-[15px] font-semibold text-ink">
        {value}
      </p>
    </div>
  );
}

function HireDialog({
  helper,
  onClose,
  onSent,
}: {
  helper: HelperDetailData;
  onClose: () => void;
  onSent: () => void;
}) {
  const request = useRequestHire(helper.id);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const first = firstName(helper.full_name);

  function submit() {
    setError(null);
    request.mutate(message.trim(), {
      onSuccess: onSent,
      onError: (e) => setError(errorMessage(e, "The request did not go through. Try again.")),
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Ask ${first} to work with you`}
      description={`${first} sees your request and your name, and can accept or decline. Nothing is agreed until you both say so.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={request.isPending} onClick={submit}>
            Send request
          </Button>
        </>
      }
    >
      <Field
        label="Message (optional)"
        htmlFor="hire-message"
        hint="The work, the hours, and when you would like to start."
        error={error}
      >
        <TextArea
          id="hire-message"
          rows={4}
          maxLength={1000}
          value={message}
          placeholder="Looking for help with cooking and cleaning, 8am to 2pm, from next Monday."
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}

function ContactCard({ contact, first }: { contact: Contact; first: string }) {
  return (
    <div className="rounded-[15px] bg-verified/10 p-4">
      <p className="text-[13px] font-semibold text-verified">Contact details</p>
      {contact.phone && (
        <a
          href={`tel:${contact.phone}`}
          data-numeric
          className="mt-1 flex items-center gap-2 text-[17px] font-semibold text-ink"
        >
          <Phone className="size-4 text-ink-muted" aria-hidden />
          {contact.phone}
        </a>
      )}
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          className="mt-1 flex items-center gap-2 break-all text-[14px] text-ink-muted"
        >
          <Mail className="size-4 shrink-0" aria-hidden />
          {contact.email}
        </a>
      )}
      {!contact.phone && !contact.email && (
        <p className="mt-1 text-[14px] text-ink-muted">
          {first} has not added a phone number or email. Send a message instead.
        </p>
      )}
    </div>
  );
}

function ContactPanel({ helper, isOwn }: { helper: HelperDetailData; isOwn: boolean }) {
  const { user, isSubscribed } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const start = useStartConversation();
  const [contact, setContact] = useState<Contact | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hiring, setHiring] = useState(false);

  const first = firstName(helper.full_name);
  const signin = `/signin?next=${encodeURIComponent(location.pathname)}`;
  const isHirer = user?.role === "hirer";
  const isAdmin = user?.role === "admin";

  // A 402 is an answer, not a failure: it renders as the membership offer.
  function fail(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 401) {
      navigate(signin);
    } else if (error instanceof ApiError && error.isPaywall) {
      setNotice({ tone: "paywall", text: error.message });
    } else {
      setNotice({ tone: "error", text: errorMessage(error, fallback) });
    }
  }

  async function reveal() {
    setRevealing(true);
    setNotice(null);
    try {
      setContact(await api<Contact>(`/helpers/${helper.id}/contact`));
    } catch (error) {
      fail(error, "Could not load the contact details.");
    } finally {
      setRevealing(false);
    }
  }

  function message() {
    setNotice(null);
    start.mutate(
      { helper_profile_id: helper.id },
      {
        onSuccess: (conversation) => navigate(`/messages/${conversation.id}`),
        onError: (error) => fail(error, "Could not open the chat."),
      },
    );
  }

  let actions;
  if (isOwn) {
    actions = (
      <>
        <p className="rounded-[15px] bg-oat p-4 text-[14px] leading-relaxed text-ink-muted">
          This is your public profile, exactly as families see it.
        </p>
        <ButtonLink to="/account" className="w-full">
          Edit my profile
        </ButtonLink>
      </>
    );
  } else if (!user) {
    actions = (
      <>
        <ButtonLink to={signin} className="w-full">
          Sign in to get in touch
        </ButtonLink>
        <p className="text-[13px] leading-relaxed text-ink-faint">
          Browsing is free. Messages, hire requests and phone numbers need a ₹99 membership.
        </p>
      </>
    );
  } else if (user.role === "helper") {
    actions = (
      <p className="rounded-[15px] bg-oat p-4 text-[14px] leading-relaxed text-ink-muted">
        Families message and hire helpers from here. Your own card is on{" "}
        <Link to="/account" className="font-semibold text-moss hover:underline">
          My profile
        </Link>
        .
      </p>
    );
  } else if (isHirer && !isSubscribed) {
    actions = (
      <PaywallCard
        body={`Message ${first}, send a hire request and see the phone number. Turn off renewal any time.`}
      />
    );
  } else {
    actions = (
      <>
        {isHirer && (
          <Button className="w-full" onClick={() => setHiring(true)}>
            <HandHeart className="size-4" aria-hidden />
            Request to hire
          </Button>
        )}
        {isHirer && (
          <Button variant="secondary" className="w-full" busy={start.isPending} onClick={message}>
            {!start.isPending && <MessageCircle className="size-4" aria-hidden />}
            Message {first}
          </Button>
        )}
        {contact ? (
          <ContactCard contact={contact} first={first} />
        ) : (
          (isHirer || isAdmin) && (
            <Button variant="secondary" className="w-full" busy={revealing} onClick={reveal}>
              {!revealing && <Phone className="size-4" aria-hidden />}
              Show contact details
            </Button>
          )
        )}
      </>
    );
  }

  return (
    <Surface className="p-5 sm:p-6">
      <p data-numeric className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-ink">
        {wageRange(helper.wage_monthly_min, helper.wage_monthly_max)}
      </p>
      <p className="mt-1.5 text-[13px] text-ink-muted">
        a month · {availabilityLine(helper.shifts, helper.hours_per_day)}
      </p>

      <div className="mt-5 space-y-2.5">{actions}</div>

      {notice &&
        (notice.tone === "paywall" ? (
          <PaywallCard compact className="mt-4" body={notice.text} />
        ) : (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "mt-4 rounded-[15px] p-3 text-[13px] leading-relaxed",
              notice.tone === "error" ? "bg-danger/10 text-danger" : "bg-verified/10 text-verified",
            )}
          >
            {notice.text}{" "}
            {notice.tone === "sent" && (
              <Link to="/hires" className="font-semibold underline underline-offset-2">
                See my hires
              </Link>
            )}
          </p>
        ))}

      {hiring && (
        <HireDialog
          helper={helper}
          onClose={() => setHiring(false)}
          onSent={() => {
            setHiring(false);
            setNotice({
              tone: "sent",
              text: `Request sent. ${first} is notified and can accept or decline.`,
            });
          }}
        />
      )}
    </Surface>
  );
}

function Profile({ helper }: { helper: HelperDetailData }) {
  const { user } = useAuth();
  const wide = useMediaQuery("(min-width: 1024px)");
  const helperMe = useHelperMe(user?.role === "helper");
  const reviews = useHelperReviews(helper.id);

  const isOwn = helperMe.data?.id === helper.id;
  const first = firstName(helper.full_name);
  const place = [helper.town_name, helper.district_name].filter(Boolean).join(", ");
  const availability = availabilityLine(helper.shifts, helper.hours_per_day);

  return (
    <section className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-6 sm:px-6 xl:px-10">
      <Link
        to="/"
        className="-ml-1 inline-flex h-11 items-center gap-1.5 rounded-full px-1 text-[14px] font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All helpers
      </Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Surface as="article">
            <div className="grid gap-6 sm:grid-cols-[200px_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)]">
              <Portrait helper={helper} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-[clamp(1.75rem,3.6vw,2.25rem)] font-bold leading-tight tracking-[-0.025em] text-ink">
                    {helper.full_name}
                  </h1>
                  {helper.id_verified && (
                    <BadgeCheck className="size-6 shrink-0 text-moss" aria-label="ID verified" />
                  )}
                </div>
                <p className="mt-1 text-[15px] text-ink-muted">
                  {[helper.service_name, place].filter(Boolean).join(" · ") || "Household help"}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <RatingStars avg={helper.rating_avg} count={helper.rating_count} size={16} />
                  <span className="text-[13px] text-ink-muted">
                    {helper.rating_count
                      ? `${helper.rating_count} review${helper.rating_count === 1 ? "" : "s"}`
                      : "No reviews yet"}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {helper.id_verified && (
                    <StatusPill tone="good">
                      <BadgeCheck className="size-3.5" aria-hidden />
                      ID verified
                    </StatusPill>
                  )}
                  {helper.police_verified && (
                    <StatusPill tone="good">
                      <ShieldCheck className="size-3.5" aria-hidden />
                      Police verified
                    </StatusPill>
                  )}
                  {helper.willing_to_live_in && (
                    <StatusPill>
                      <House className="size-3.5" aria-hidden />
                      Open to live-in
                    </StatusPill>
                  )}
                </div>

                {helper.headline && (
                  <p className="mt-5 font-display text-[19px] font-semibold leading-snug text-ink">
                    {helper.headline}
                  </p>
                )}
                {helper.bio && (
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink-muted">
                    {helper.bio}
                  </p>
                )}
              </div>
            </div>
          </Surface>

          {!wide && (
            <div id="contact" className="scroll-mt-24">
              <ContactPanel helper={helper} isOwn={isOwn} />
            </div>
          )}

          <Surface as="section">
            <SectionHeading title="Details" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Detail
                label="Wage per month"
                value={wageRange(helper.wage_monthly_min, helper.wage_monthly_max)}
              />
              <Detail label="Availability" value={availability} />
              <Detail
                label="Experience"
                value={helper.experience_years > 0 ? experienceLabel(helper.experience_years) : "New to this work"}
              />
              <Detail label="Languages" value={helper.languages.join(", ") || "Not stated"} />
              <Detail
                label="Area"
                value={[place, helper.landmark].filter(Boolean).join(" · ") || "Kerala"}
              />
              <Detail label="Live-in" value={helper.willing_to_live_in ? "Yes" : "No"} />
            </div>

            {helper.skills.length > 0 && (
              <>
                <h3 className="mt-6 text-[13px] font-semibold text-ink">
                  What {first} does
                </h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {helper.skills.map((skill) => (
                    <li
                      key={skill.slug}
                      className="rounded-[7px] bg-oat px-3 py-1.5 font-display text-[13px] font-semibold text-ink"
                    >
                      {skill.name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Surface>

          <Surface as="section">
            <SectionHeading
              title="Reviews"
              action={
                helper.rating_count > 0 && (
                  <RatingStars avg={helper.rating_avg} count={helper.rating_count} size={15} />
                )
              }
            />
            <div className="mt-4">
              {reviews.isLoading ? (
                <Skeleton className="h-24" />
              ) : (
                <ReviewList
                  reviews={reviews.data ?? []}
                  empty={`No reviews yet. Reviews come from families who have hired ${first} through Sahaya.`}
                />
              )}
            </div>
          </Surface>

          {/* Honest about what a badge does and does not mean. Over-claiming
              verification is the fastest way to lose trust after one incident. */}
          <p className="rounded-[15px] bg-paper/60 p-4 text-[13px] leading-relaxed text-ink-muted">
            <strong className="font-semibold text-ink">About verification.</strong> An ID badge
            means we have seen a government photo ID matching this name. It is not a background
            check. Meet in person and ask for references before hiring.{" "}
            <Link to="/help" className="font-semibold text-moss hover:underline">
              Hiring safely
            </Link>
          </p>
        </div>

        {wide && (
          <aside className="sticky top-24">
            <ContactPanel helper={helper} isOwn={isOwn} />
          </aside>
        )}
      </div>

      {!wide && !isOwn && (
        <>
          <div aria-hidden className="h-20" />
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-paper/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
            <div className="mx-auto flex max-w-[720px] items-center gap-3">
              <div className="min-w-0 flex-1">
                <p data-numeric className="font-display text-[17px] font-bold text-ink">
                  {wageRange(helper.wage_monthly_min, helper.wage_monthly_max)}
                </p>
                <p className="truncate text-[12px] text-ink-muted">a month · {availability}</p>
              </div>
              <Button onClick={() => scrollTo("#contact", -96)}>Get in touch</Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function ViewProfile() {
  const { id } = useParams();
  const { data: helper, isLoading } = useHelper(id);

  if (isLoading) {
    return (
      <div aria-hidden className="mx-auto w-full max-w-[1100px] px-4 pt-16 sm:px-6 xl:px-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-80 rounded-[var(--radius-panel)]" />
          <Skeleton className="h-56 rounded-[var(--radius-panel)]" />
        </div>
      </div>
    );
  }

  if (!helper) {
    return (
      <PageShell title="Profile not available" width="narrow">
        <Surface>
          <EmptyState
            icon={SearchX}
            title="This helper is not listed right now"
            body="They may have paused their listing. Browsing is always free."
            action={<ButtonLink to="/">Back to all helpers</ButtonLink>}
          />
        </Surface>
      </PageShell>
    );
  }

  return <Profile helper={helper} />;
}
