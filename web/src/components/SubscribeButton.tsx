import { useEffect, useState } from "react";

import { Button } from "@/components/kit/Button";
import { useSubscribe } from "@/features/account/queries";
import { useAuth } from "@/features/auth/AuthContext";
import { ApiError } from "@/lib/api";
import { openCheckout } from "@/lib/checkout";

/**
 * Start a membership. After Razorpay reports payment, this waits for the
 * webhook to switch access on -- it polls /auth/me rather than trusting the
 * checkout callback (see lib/checkout.ts).
 */
export function SubscribeButton({
  label = "Get a membership · ₹99 a month",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const { user, refreshMe, isSubscribed } = useAuth();
  const subscribe = useSubscribe();
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Derived rather than reset in an effect: once the webhook has switched the
  // membership on, there is nothing left to wait for.
  const confirming = waiting && !isSubscribed;

  useEffect(() => {
    if (!confirming) return;
    const poll = window.setInterval(() => void refreshMe(), 3000);
    const giveUp = window.setTimeout(() => {
      setWaiting(false);
      setMessage("Payment received. Your membership will switch on within a few minutes.");
    }, 90_000);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
  }, [confirming, refreshMe]);

  async function start() {
    setMessage(null);
    try {
      const membership = await subscribe.mutateAsync();
      if (membership.is_active) {
        await refreshMe();
        return;
      }
      if (!membership.razorpay_key_id || !membership.razorpay_subscription_id) {
        setMessage("Payments are not switched on for this server yet.");
        return;
      }
      await openCheckout({
        keyId: membership.razorpay_key_id,
        subscriptionId: membership.razorpay_subscription_id,
        prefill: {
          name: user?.full_name || undefined,
          email: user?.email ?? undefined,
          contact: user?.phone ?? undefined,
        },
        onPaid: () => setWaiting(true),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 503) {
        setMessage("Payments are not switched on for this server yet.");
      } else {
        setMessage(
          error instanceof ApiError ? error.message : "Could not start the payment. Try again.",
        );
      }
    }
  }

  return (
    <div className={className}>
      <Button onClick={start} busy={subscribe.isPending || confirming}>
        {confirming ? "Waiting for confirmation…" : label}
      </Button>
      {message && (
        <p role="status" className="mt-2 text-[13px] leading-snug text-ink-muted">
          {message}
        </p>
      )}
    </div>
  );
}
