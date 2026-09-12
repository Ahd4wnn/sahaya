import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { TextMorph } from "torph/react";

import { SubscribeButton } from "@/components/SubscribeButton";
import { ButtonLink } from "@/components/kit/Button";
import { Segmented } from "@/components/kit/Form";
import { Surface } from "@/components/kit/Surface";
import { useAuth } from "@/features/auth/AuthContext";

type Side = "hirer" | "helper";

const PLANS: Record<Side, { title: string; blurb: string; features: string[] }> = {
  hirer: {
    title: "Family membership",
    blurb: "Find and reach trusted help near you.",
    features: [
      "Browse every listed helper, free",
      "Message helpers directly",
      "See phone numbers and email",
      "Send hire requests",
      "Rate the helpers you work with",
    ],
  },
  helper: {
    title: "Helper membership",
    blurb: "Get found by families near you.",
    features: [
      "Your card listed in search",
      "Set your own monthly wage",
      "Receive messages and hire requests",
      "Build a rating families can see",
      "We never take a cut of your salary",
    ],
  },
};

const FACTS = [
  {
    title: "No cut, ever",
    body: "What a family and a helper agree is what the helper is paid.",
  },
  {
    title: "Stop any time",
    body: "Turn off renewal in Settings. You keep the days you have paid for.",
  },
  {
    title: "Both sides are members",
    body: "Messages need a membership on each side, so everyone you talk to is serious.",
  },
];

export function Pricing() {
  const { user, isSubscribed } = useAuth();
  // Derived, not stored: until the visitor picks, show the plan for the side
  // they are signed in as -- even if the session restores after first paint.
  const [picked, setPicked] = useState<Side | null>(null);
  const side: Side = picked ?? (user?.role === "helper" ? "helper" : "hirer");
  const plan = PLANS[side];

  let cta: ReactNode;
  if (!user) {
    cta = (
      <ButtonLink to={`/join?as=${side}&next=${encodeURIComponent("/pricing")}`} className="w-full">
        Get started
      </ButtonLink>
    );
  } else if (user.role === "admin") {
    cta = <p className="text-[14px] text-ink-muted">Admin accounts do not need a membership.</p>;
  } else if (user.role !== side) {
    cta = (
      <p className="rounded-[15px] bg-oat p-4 text-[14px] leading-relaxed text-ink-muted">
        You are signed in as {user.role === "helper" ? "a helper" : "a family"}. This plan is
        for {side === "helper" ? "helpers" : "families"}.
      </p>
    );
  } else if (isSubscribed) {
    cta = (
      <>
        <p className="rounded-[15px] bg-verified/10 p-4 text-[14px] font-medium text-verified">
          Your membership is active.
        </p>
        <ButtonLink to="/settings#membership" variant="secondary" className="mt-3 w-full">
          Manage membership
        </ButtonLink>
      </>
    );
  } else {
    cta = <SubscribeButton className="[&>button]:w-full" label="Start membership · ₹99 a month" />;
  }

  return (
    <section className="mx-auto w-full max-w-[880px] px-4 pb-10 pt-10 sm:px-6 sm:pt-16">
      <header className="text-center">
        <h1 className="font-display text-[clamp(2.25rem,6vw,3.25rem)] font-bold leading-tight tracking-[-0.03em] text-ink">
          One price. Both sides.
        </h1>
        <p className="mx-auto mt-3 max-w-[46ch] text-[16px] leading-relaxed text-ink-muted">
          Agencies take a cut of what a worker earns, often the whole first month. Sahaya
          charges a flat fee instead and leaves the wage alone.
        </p>
      </header>

      <div className="mt-8 flex justify-center">
        <Segmented
          id="pricing-side"
          label="Choose a membership"
          value={side}
          onChange={setPicked}
          options={[
            { value: "hirer", label: "For families" },
            { value: "helper", label: "For helpers" },
          ]}
        />
      </div>

      <Surface className="mt-6 overflow-hidden p-0 sm:p-0">
        <div className="grid gap-8 p-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:p-10">
          <div>
            <h2 className="font-display text-[24px] font-semibold text-ink">
              {/* torph morphs the title letter by letter when the plan changes. */}
              <TextMorph>{plan.title}</TextMorph>
            </h2>
            <p className="mt-1 text-[14px] text-ink-muted">{plan.blurb}</p>

            <p className="mt-6 flex items-baseline gap-1">
              <span data-numeric className="font-display text-[56px] font-bold leading-none text-ink">
                ₹99
              </span>
              <span className="text-[15px] text-ink-muted">/month</span>
            </p>
            <p className="mt-2 text-[13px] text-ink-faint">
              Billed monthly by UPI Autopay or card. Turn off renewal any time.
            </p>

            <div className="mt-6">{cta}</div>
          </div>

          <ul className="space-y-3 sm:border-l sm:border-line-soft sm:pl-8">
            {plan.features.map((feature) => (
              <li key={feature} className="flex gap-3 text-[15px] text-ink">
                <Check className="mt-0.5 size-4 shrink-0 text-moss" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="border-t border-line-soft bg-oat/60 px-6 py-4 text-[13px] text-ink-muted sm:px-10">
          Browsing profiles is free for everyone, always. You only pay when you want to get in
          touch.
        </p>
      </Surface>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {FACTS.map((fact) => (
          <div key={fact.title} className="rounded-[15px] bg-paper p-5">
            <p className="font-display text-[15px] font-semibold text-ink">{fact.title}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">{fact.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
