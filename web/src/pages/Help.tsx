import type { ReactNode } from "react";
import {
  BadgeCheck,
  BadgeIndianRupee,
  CalendarX2,
  HandCoins,
  KeyRound,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ButtonLink } from "@/components/kit/Button";
import { PageShell, SectionHeading, Surface } from "@/components/kit/Surface";
import { useAuth, useShowBecomeHelper } from "@/features/auth/AuthContext";

const FAMILY_STEPS = [
  {
    title: "Browse, free",
    body: "Every listed helper, with their wage, hours and reviews. No account needed.",
  },
  {
    title: "Get a membership",
    body: "₹99 a month unlocks messages, phone numbers and hire requests.",
  },
  {
    title: "Talk and agree",
    body: "Message a helper, meet them, and agree the wage and hours between you.",
  },
  {
    title: "Review each other",
    body: "Once the work is done you both leave a review. It keeps everyone honest.",
  },
];

const HELPER_STEPS = [
  {
    title: "Build your card",
    body: "Your photo, your skills, your hours and the monthly wage you ask for.",
  },
  {
    title: "Get listed",
    body: "Your card is in search while your ₹99 membership is active.",
  },
  {
    title: "Hear from families",
    body: "Families message you and send hire requests. You accept or decline.",
  },
  {
    title: "Keep your whole salary",
    body: "Sahaya never takes a cut. What you agree with the family is what you are paid.",
  },
];

function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="mt-5 grid gap-3 sm:grid-cols-2">
      {items.map((item, index) => (
        <li key={item.title} className="rounded-[15px] bg-oat p-4">
          <p className="font-display text-[12px] font-semibold uppercase tracking-wide text-sage">
            Step {index + 1}
          </p>
          <p className="mt-1 font-display text-[16px] font-semibold text-ink">{item.title}</p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">{item.body}</p>
        </li>
      ))}
    </ol>
  );
}

function Point({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-oat text-moss">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-[14px] leading-relaxed text-ink-muted">{children}</p>
      </div>
    </li>
  );
}

export function Help() {
  const { assistantEnabled } = useAuth();
  const showBecomeHelper = useShowBecomeHelper();
  return (
    <PageShell
      title="Help & safety"
      subtitle="How Sahaya works, what it costs, and how to hire safely."
      width="narrow"
    >
      <div className="space-y-6">
        <Surface as="section">
          <SectionHeading
            title="For families"
            description="Find help near you and get in touch directly."
          />
          <Steps items={FAMILY_STEPS} />
        </Surface>

        <Surface as="section">
          <SectionHeading
            title="For helpers"
            description="Get found by families near you, on your own terms."
          />
          <Steps items={HELPER_STEPS} />
        </Surface>

        <Surface as="section">
          <SectionHeading title="Money" />
          <ul className="mt-5 space-y-4">
            <Point icon={BadgeIndianRupee} title="₹99 a month, on both sides">
              Families and helpers pay the same flat fee. Browsing is free for everyone.
            </Point>
            <Point icon={HandCoins} title="No cut of anyone's salary">
              Agencies often take a helper's whole first month. Sahaya takes nothing from
              wages, ever.
            </Point>
            <Point icon={CalendarX2} title="Turn off renewal any time">
              From Settings. You keep the days you have already paid for.
            </Point>
          </ul>
        </Surface>

        <Surface as="section">
          <SectionHeading title="Hiring safely" />
          <ul className="mt-5 space-y-4">
            <Point icon={BadgeCheck} title="What “ID verified” means">
              We have seen a government photo ID that matches the name on the card. It is
              not a background check.
            </Point>
            <Point icon={ShieldCheck} title="What “Police verified” means">
              The helper has shown us a police clearance certificate.
            </Point>
            <Point icon={Users} title="Meet first">
              Meet in person, ask for references, and agree a trial day before anyone
              moves in.
            </Point>
            <Point icon={KeyRound} title="Keep your codes to yourself">
              Sahaya never asks for your sign-in code, your card number, or a payment
              outside the checkout on this site.
            </Point>
          </ul>
        </Surface>

        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/">Find help</ButtonLink>
          {assistantEnabled && (
            <ButtonLink to="/messages/assistant" variant="secondary">
              Ask Sahaya
            </ButtonLink>
          )}
          {showBecomeHelper && (
            <ButtonLink to="/join?as=helper" variant="secondary">
              Become a Helper
            </ButtonLink>
          )}
        </div>
      </div>
    </PageShell>
  );
}
