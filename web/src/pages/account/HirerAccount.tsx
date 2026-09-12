import { useState } from "react";
import { UserRoundX } from "lucide-react";

import { RatingStars } from "@/components/RatingStars";
import { ReviewList } from "@/components/ReviewList";
import { SaveBar } from "@/components/SaveBar";
import { SubscribeButton } from "@/components/SubscribeButton";
import { ButtonLink } from "@/components/kit/Button";
import { Field, TextArea, TextInput } from "@/components/kit/Form";
import {
  EmptyState,
  PageShell,
  SectionHeading,
  Skeleton,
  StatusPill,
  Surface,
} from "@/components/kit/Surface";
import {
  useHirerMe,
  useUpdateHirerMe,
  type HirerMe,
  type HirerPatch,
} from "@/features/account/queries";
import { useAuth } from "@/features/auth/AuthContext";
import { useUserReviews } from "@/features/hires/queries";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LocationFields } from "./LocationFields";

/**
 * A family's own profile. Nothing here is public: helpers see a family's
 * name when they are messaged or sent a request, and reviews carry a first
 * name and initial. Same draft pattern as the helper page.
 */

interface Draft {
  full_name: string;
  household_size: string;
  about: string;
  district: string | null;
  town: string | null;
  landmark: string;
}

function toDraft(me: HirerMe): Draft {
  return {
    full_name: me.full_name,
    household_size: me.household_size ? String(me.household_size) : "",
    about: me.about,
    district: me.district,
    town: me.town,
    landmark: me.landmark,
  };
}

function problem(d: Draft): string | null {
  if (!d.full_name.trim()) return "Add your name.";
  if (d.household_size) {
    const size = Number(d.household_size);
    if (!Number.isInteger(size) || size < 1 || size > 30) {
      return "Household size must be between 1 and 30.";
    }
  }
  return null;
}

/** hirers.py ignores an empty value for plain fields, so only filled ones are
 *  sent; district and town are sent as they are, because null clears them. */
function toPatch(d: Draft, base: Draft): HirerPatch {
  const patch: HirerPatch = {};
  if (d.full_name !== base.full_name) patch.full_name = d.full_name.trim();
  if (d.household_size && d.household_size !== base.household_size) {
    patch.household_size = Number(d.household_size);
  }
  if (d.about !== base.about) patch.about = d.about.trim();
  if (d.district !== base.district) patch.district = d.district;
  if (d.town !== base.town) patch.town = d.town;
  if (d.landmark !== base.landmark) patch.landmark = d.landmark.trim();
  return patch;
}

export function HirerAccount() {
  const { user, isSubscribed } = useAuth();
  const me = useHirerMe(true);
  const update = useUpdateHirerMe();
  const reviews = useUserReviews(user?.id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (me.isError) {
    return (
      <PageShell title="My profile">
        <Surface>
          <EmptyState
            icon={UserRoundX}
            title="Your profile could not be loaded"
            body={errorMessage(me.error, "Refresh the page to try again.")}
          />
        </Surface>
      </PageShell>
    );
  }

  if (!me.data) {
    return (
      <PageShell title="My profile">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-96 rounded-[var(--radius-panel)]" />
          <Skeleton className="h-56 rounded-[var(--radius-panel)]" />
        </div>
      </PageShell>
    );
  }

  const profile = me.data;
  const base = toDraft(profile);
  const d = draft ?? base;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(base);

  function edit(patch: Partial<Draft>) {
    setError(null);
    setDraft({ ...d, ...patch });
  }

  function save() {
    const issue = problem(d);
    if (issue) {
      setError(issue);
      return;
    }
    const patch = toPatch(d, base);
    if (!Object.keys(patch).length) {
      setDraft(null);
      return;
    }
    update.mutate(patch, {
      onSuccess: () => setDraft(null),
      onError: (e) => setError(errorMessage(e, "Your changes did not save. Try again.")),
    });
  }

  return (
    <PageShell
      title="My profile"
      subtitle="Your household's details. Helpers see your name when you message them or send a request."
    >
      <div
        className={cn(
          "grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start",
          dirty && "pb-24",
        )}
      >
        <div className="min-w-0 space-y-6">
          <Surface className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {isSubscribed ? (
                <StatusPill tone="good">Membership active</StatusPill>
              ) : (
                <StatusPill tone="warn">No membership</StatusPill>
              )}
              <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">
                {isSubscribed
                  ? "You can message helpers, send hire requests and see contact details."
                  : "Browsing is free. A ₹99 membership lets you message helpers, send hire requests and see contact details."}
              </p>
            </div>
            {isSubscribed ? (
              <ButtonLink to="/settings#membership" variant="secondary" size="sm">
                Manage
              </ButtonLink>
            ) : (
              <SubscribeButton className="shrink-0" />
            )}
          </Surface>

          <Surface as="section">
            <SectionHeading title="Your household" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="f-name">
                <TextInput
                  id="f-name"
                  autoComplete="name"
                  maxLength={120}
                  value={d.full_name}
                  onChange={(event) => edit({ full_name: event.target.value })}
                />
              </Field>
              <Field label="People at home" htmlFor="f-size" hint="Including children and elders.">
                <TextInput
                  id="f-size"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  value={d.household_size}
                  onChange={(event) => edit({ household_size: event.target.value })}
                />
              </Field>
              <Field
                className="sm:col-span-2"
                label="What you need"
                htmlFor="f-about"
                hint="The help you are looking for, and anything worth knowing about your home."
              >
                <TextArea
                  id="f-about"
                  rows={4}
                  maxLength={1000}
                  value={d.about}
                  onChange={(event) => edit({ about: event.target.value })}
                />
              </Field>
            </div>
          </Surface>

          <Surface as="section">
            <SectionHeading title="Where you live" />
            <div className="mt-5 space-y-4">
              <LocationFields
                idPrefix="f"
                district={d.district}
                town={d.town}
                onChange={(location) => edit(location)}
              />
              <Field
                label="Landmark (optional)"
                htmlFor="f-landmark"
                hint="Not shown on any public page."
              >
                <TextInput
                  id="f-landmark"
                  maxLength={160}
                  value={d.landmark}
                  onChange={(event) => edit({ landmark: event.target.value })}
                />
              </Field>
            </div>
          </Surface>
        </div>

        <aside className="lg:sticky lg:top-24">
          <Surface>
            <SectionHeading
              title="Your rating"
              description="From helpers you have worked with."
              action={
                profile.rating_count > 0 && (
                  <RatingStars avg={profile.rating_avg} count={profile.rating_count} size={15} />
                )
              }
            />
            <div className="mt-4">
              {reviews.isLoading ? (
                <Skeleton className="h-20" />
              ) : (
                <ReviewList
                  reviews={reviews.data ?? []}
                  empty="No reviews yet. After a job is marked completed, the helper can review you here."
                />
              )}
            </div>
          </Surface>
        </aside>
      </div>

      <SaveBar
        visible={dirty}
        busy={update.isPending}
        error={error}
        onSave={save}
        onDiscard={() => {
          setDraft(null);
          setError(null);
        }}
      />
    </PageShell>
  );
}
