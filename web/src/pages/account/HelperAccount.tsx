import { useState } from "react";
import { Check, Circle, UserRoundX } from "lucide-react";

import { HelperCard } from "@/components/HelperCard";
import { PhotoUpload } from "@/components/PhotoUpload";
import { SaveBar } from "@/components/SaveBar";
import { SubscribeButton } from "@/components/SubscribeButton";
import { ButtonLink } from "@/components/kit/Button";
import { ChipToggle, Field, Select, Switch, TextArea, TextInput } from "@/components/kit/Form";
import {
  EmptyState,
  PageShell,
  SectionHeading,
  Skeleton,
  StatusPill,
  Surface,
} from "@/components/kit/Surface";
import {
  useDistricts,
  useHelperMe,
  useTaxonomy,
  useTowns,
  useUpdateHelperMe,
  type HelperMe,
  type HelperPatch,
} from "@/features/helpers/queries";
import type { District, HelperCardData, Service, Shift, Skill, Town } from "@/features/helpers/types";
import { errorMessage } from "@/lib/api";
import { shiftLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DocumentsSection } from "./DocumentsSection";
import { LocationFields } from "./LocationFields";

/**
 * A helper's own profile: the form on the left, their real card on the right,
 * updating as they type. The card is the product's most important object, so
 * the helper edits it while looking at it rather than guessing from fields.
 *
 * The draft is held separately from the server copy and only exists once
 * something is edited; saving or discarding drops it, and the form falls back
 * to whatever the server last said. No effect copies server data into state.
 */

const SHIFTS: Shift[] = ["morning", "afternoon", "evening", "full_day"];
const LANGUAGES = ["Malayalam", "English", "Hindi", "Tamil", "Kannada", "Bengali", "Odia", "Assamese"];

/** Rupees, not paise, and numbers as the strings the inputs hold. */
interface Draft {
  full_name: string;
  service: string;
  headline: string;
  bio: string;
  experience_years: string;
  wage_min: string;
  wage_max: string;
  hours_per_day: string;
  skills: string[];
  languages: string[];
  shifts: Shift[];
  willing_to_live_in: boolean;
  district: string | null;
  town: string | null;
  landmark: string;
}

function toDraft(me: HelperMe): Draft {
  return {
    full_name: me.full_name,
    service: me.service ?? "",
    headline: me.headline,
    bio: me.bio,
    experience_years: String(me.experience_years),
    wage_min: me.wage_monthly_min ? String(Math.round(me.wage_monthly_min / 100)) : "",
    wage_max: me.wage_monthly_max ? String(Math.round(me.wage_monthly_max / 100)) : "",
    hours_per_day: String(me.hours_per_day),
    skills: me.skills.map((skill) => skill.slug),
    languages: me.languages,
    shifts: me.shifts,
    willing_to_live_in: me.willing_to_live_in,
    district: me.district,
    town: me.town,
    landmark: me.landmark,
  };
}

/** The same bounds the API enforces (WAGE_MIN_PAISE / WAGE_MAX_PAISE in
 *  backend/app/schemas/helper.py), said in words before the round trip. */
function problem(d: Draft): string | null {
  if (!d.full_name.trim()) return "Add your name.";
  const min = Number(d.wage_min);
  const max = Number(d.wage_max || d.wage_min);
  if (!d.wage_min) return "Add the monthly wage you ask for.";
  if (!Number.isFinite(min) || min < 1000) return "The lowest monthly wage Sahaya accepts is ₹1,000.";
  if (!Number.isFinite(max) || max > 200000) return "The highest monthly wage Sahaya accepts is ₹2,00,000.";
  if (max < min) return "The top of your wage range is below the bottom.";
  const hours = Number(d.hours_per_day);
  if (!Number.isInteger(hours) || hours < 1 || hours > 16) return "Hours per day must be between 1 and 16.";
  const years = Number(d.experience_years || 0);
  if (!Number.isInteger(years) || years < 0 || years > 60) return "Years of experience must be between 0 and 60.";
  return null;
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function toPatch(d: Draft, base: Draft): HelperPatch {
  const patch: HelperPatch = {};
  if (d.full_name !== base.full_name) patch.full_name = d.full_name.trim();
  if (d.service && d.service !== base.service) patch.service = d.service;
  if (d.headline !== base.headline) patch.headline = d.headline.trim();
  if (d.bio !== base.bio) patch.bio = d.bio.trim();
  if (d.experience_years !== base.experience_years) {
    patch.experience_years = Number(d.experience_years || 0);
  }
  if (d.wage_min !== base.wage_min || d.wage_max !== base.wage_max) {
    patch.wage_monthly_min = Number(d.wage_min) * 100;
    patch.wage_monthly_max = Number(d.wage_max || d.wage_min) * 100;
  }
  if (d.hours_per_day !== base.hours_per_day) patch.hours_per_day = Number(d.hours_per_day);
  if (!sameList(d.skills, base.skills)) patch.skills = d.skills;
  if (!sameList(d.languages, base.languages)) patch.languages = d.languages;
  if (!sameList(d.shifts, base.shifts)) patch.shifts = d.shifts;
  if (d.willing_to_live_in !== base.willing_to_live_in) {
    patch.willing_to_live_in = d.willing_to_live_in;
  }
  if (d.district && d.district !== base.district) patch.district = d.district;
  // A new district always sends the town too, even when it is empty, so the
  // old district's town is cleared rather than left dangling.
  if (d.town !== base.town || d.district !== base.district) patch.town = d.town;
  if (d.landmark !== base.landmark) patch.landmark = d.landmark.trim();
  return patch;
}

function preview(
  me: HelperMe,
  d: Draft,
  services: Service[],
  skills: Skill[],
  districts: District[],
  towns: Town[],
): HelperCardData {
  return {
    ...me,
    full_name: d.full_name.trim() || me.full_name,
    service: d.service || null,
    service_name: services.find((s) => s.slug === d.service)?.name ?? me.service_name,
    headline: d.headline,
    skills: d.skills.flatMap((slug) => skills.filter((skill) => skill.slug === slug)),
    experience_years: Number(d.experience_years || 0),
    wage_monthly_min: Number(d.wage_min || 0) * 100,
    wage_monthly_max: Number(d.wage_max || d.wage_min || 0) * 100,
    shifts: d.shifts,
    hours_per_day: Number(d.hours_per_day) || me.hours_per_day,
    willing_to_live_in: d.willing_to_live_in,
    languages: d.languages,
    district: d.district,
    district_name: districts.find((x) => x.slug === d.district)?.name ?? null,
    town: d.town,
    town_name: towns.find((x) => x.slug === d.town)?.name ?? null,
  };
}

function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function ListingStatus({ me }: { me: HelperMe }) {
  const checks = [
    { done: Boolean(me.photo_url), label: "A photo" },
    { done: Boolean(me.service), label: "Your service" },
    { done: Boolean(me.district), label: "Your district" },
    { done: me.wage_monthly_min > 0, label: "Your monthly wage" },
  ];

  return (
    <Surface className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {me.is_listed ? (
          <StatusPill tone="good">Listed</StatusPill>
        ) : (
          <StatusPill tone="warn">Not listed yet</StatusPill>
        )}
        <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-ink-muted">
          {me.is_listed
            ? "Families can find your card in search right now."
            : me.has_active_subscription
              ? "Your card is not showing in search at the moment. It switches on shortly after your membership starts."
              : "Your card goes live in search while your ₹99 membership is active. Sahaya never takes a cut of your salary."}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {checks.map((check) => (
            <li
              key={check.label}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-[12px] font-semibold",
                check.done ? "bg-verified/10 text-verified" : "bg-oat text-ink-muted",
              )}
            >
              {check.done ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Circle className="size-3.5" aria-hidden />
              )}
              {check.label}
              <span className="sr-only">{check.done ? ", done" : ", missing"}</span>
            </li>
          ))}
        </ul>
      </div>
      {!me.has_active_subscription && (
        <SubscribeButton className="shrink-0" label="Get listed · ₹99 a month" />
      )}
    </Surface>
  );
}

export function HelperAccount() {
  const me = useHelperMe();
  const update = useUpdateHelperMe();
  const { data: taxonomy } = useTaxonomy();
  const { data: districts } = useDistricts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = me.data ? toDraft(me.data) : null;
  const current = draft ?? base;
  const towns = useTowns(current?.district ?? undefined);

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

  if (!me.data || !current || !base) {
    return (
      <PageShell title="My profile" width="wide">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <Skeleton className="h-32 rounded-[var(--radius-panel)]" />
            <Skeleton className="h-80 rounded-[var(--radius-panel)]" />
          </div>
          <Skeleton className="h-96 rounded-[var(--radius-panel)]" />
        </div>
      </PageShell>
    );
  }

  const profile = me.data;
  const d = current;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(base);
  const services = taxonomy?.services ?? [];
  const skills = taxonomy?.skills ?? [];
  // An archived service can be kept but not chosen again (helpers.py), so it
  // only appears here for someone who already has it.
  const archived = profile.service && !services.some((s) => s.slug === profile.service);
  const languages = [...new Set([...LANGUAGES, ...d.languages])];
  const card = preview(profile, d, services, skills, districts ?? [], towns.data ?? []);

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
    const patch = toPatch(d, base!);
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
      subtitle="This is your card. Families see it in search and on your profile page."
      width="wide"
      actions={
        <ButtonLink to={`/helpers/${profile.id}`} variant="secondary" size="sm">
          View public profile
        </ButtonLink>
      }
    >
      <div
        className={cn(
          "grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start",
          dirty && "pb-24",
        )}
      >
        <div className="min-w-0 space-y-6">
          <ListingStatus me={profile} />

          <Surface as="section">
            <SectionHeading
              title="Photo"
              description="We remove the background for your card, and keep the original for your profile page."
            />
            <div className="mt-5">
              <PhotoUpload helper={profile} />
            </div>
          </Surface>

          <Surface as="section">
            <SectionHeading title="About you" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="h-name">
                <TextInput
                  id="h-name"
                  autoComplete="name"
                  maxLength={120}
                  value={d.full_name}
                  onChange={(event) => edit({ full_name: event.target.value })}
                />
              </Field>
              <Field label="Main service" htmlFor="h-service">
                <Select
                  id="h-service"
                  value={d.service}
                  onChange={(event) => edit({ service: event.target.value })}
                >
                  <option value="" disabled>
                    Choose a service
                  </option>
                  {services.map((service) => (
                    <option key={service.slug} value={service.slug}>
                      {service.name}
                    </option>
                  ))}
                  {archived && (
                    <option value={profile.service!}>
                      {profile.service_name} (no longer offered)
                    </option>
                  )}
                </Select>
              </Field>
              <Field
                className="sm:col-span-2"
                label="Headline"
                htmlFor="h-headline"
                hint={`The line families read first. ${d.headline.length}/160`}
              >
                <TextInput
                  id="h-headline"
                  maxLength={160}
                  value={d.headline}
                  placeholder="Experienced cook, patient with elders"
                  onChange={(event) => edit({ headline: event.target.value })}
                />
              </Field>
              <Field
                className="sm:col-span-2"
                label="About you"
                htmlFor="h-bio"
                hint="Your experience, what you are good at, and anything a family should know."
              >
                <TextArea
                  id="h-bio"
                  rows={5}
                  maxLength={2000}
                  value={d.bio}
                  onChange={(event) => edit({ bio: event.target.value })}
                />
              </Field>
              <Field label="Years of experience" htmlFor="h-exp">
                <TextInput
                  id="h-exp"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={60}
                  value={d.experience_years}
                  onChange={(event) => edit({ experience_years: event.target.value })}
                />
              </Field>
            </div>
          </Surface>

          <Surface as="section">
            <SectionHeading title="Your work" description="What you do, in which languages, and when." />

            <fieldset className="mt-5">
              <legend className="text-[13px] font-semibold text-ink">Skills</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <ChipToggle
                    key={skill.slug}
                    selected={d.skills.includes(skill.slug)}
                    onClick={() => edit({ skills: toggled(d.skills, skill.slug) })}
                  >
                    {skill.name}
                  </ChipToggle>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-[13px] font-semibold text-ink">Languages</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {languages.map((language) => (
                  <ChipToggle
                    key={language}
                    selected={d.languages.includes(language)}
                    onClick={() => edit({ languages: toggled(d.languages, language) })}
                  >
                    {language}
                  </ChipToggle>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-[13px] font-semibold text-ink">When you can work</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {SHIFTS.map((shift) => (
                  <ChipToggle
                    key={shift}
                    selected={d.shifts.includes(shift)}
                    onClick={() => edit({ shifts: toggled(d.shifts, shift) })}
                  >
                    {shiftLabel(shift)}
                  </ChipToggle>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Hours per day" htmlFor="h-hours">
                <TextInput
                  id="h-hours"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={16}
                  value={d.hours_per_day}
                  onChange={(event) => edit({ hours_per_day: event.target.value })}
                />
              </Field>
            </div>

            <div className="mt-3">
              <Switch
                checked={d.willing_to_live_in}
                onChange={(next) => edit({ willing_to_live_in: next })}
                label="Open to living in"
                description="Families looking for live-in help can filter for this."
              />
            </div>
          </Surface>

          <Surface as="section">
            <SectionHeading
              title="Monthly wage"
              description="What you ask for each month. You agree the final amount with the family, and Sahaya never takes a cut."
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="From (₹ a month)" htmlFor="h-wmin">
                <TextInput
                  id="h-wmin"
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  max={200000}
                  step={500}
                  placeholder="15000"
                  value={d.wage_min}
                  onChange={(event) => edit({ wage_min: event.target.value })}
                />
              </Field>
              <Field
                label="Up to (₹ a month)"
                htmlFor="h-wmax"
                hint="Leave empty to show a single figure."
              >
                <TextInput
                  id="h-wmax"
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  max={200000}
                  step={500}
                  placeholder="19000"
                  value={d.wage_max}
                  onChange={(event) => edit({ wage_max: event.target.value })}
                />
              </Field>
            </div>
          </Surface>

          <Surface as="section">
            <SectionHeading title="Where you work" description="Families search by district and town." />
            <div className="mt-5 space-y-4">
              <LocationFields
                idPrefix="h"
                district={d.district}
                town={d.town}
                onChange={(location) => edit(location)}
              />
              <Field
                label="Landmark (optional)"
                htmlFor="h-landmark"
                hint="A well-known place near you, like a church, temple or bus stop."
              >
                <TextInput
                  id="h-landmark"
                  maxLength={160}
                  value={d.landmark}
                  onChange={(event) => edit({ landmark: event.target.value })}
                />
              </Field>
            </div>
          </Surface>

          <Surface as="section">
            <DocumentsSection helper={profile} />
          </Surface>
        </div>

        <aside className="order-first lg:sticky lg:top-24 lg:order-none">
          <Surface>
            <p className="font-display text-[15px] font-semibold text-ink">How families see you</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {dirty ? "Showing your unsaved changes." : "Updates as you type. Save to publish."}
            </p>
            {/* Room for the cut-out portrait, which breaks 34px above the card. */}
            <div className="mt-12">
              <HelperCard helper={card} />
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
