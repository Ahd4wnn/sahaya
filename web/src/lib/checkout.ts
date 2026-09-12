/**
 * Razorpay Checkout, loaded only when someone actually pays.
 *
 * Checkout's success callback grants nothing. Access arrives when the verified
 * `subscription.activated` webhook lands (backend: billing.py) -- a client
 * callback can be spoofed, dropped, or fired from a tab that closes. The
 * callback here only tells the page to start waiting for the real thing.
 */

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayCheckout {
  open: () => void;
}

interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayCheckout;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Could not reach Razorpay."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export async function openCheckout({
  keyId,
  subscriptionId,
  prefill,
  onPaid,
  onDismiss,
}: {
  keyId: string;
  subscriptionId: string;
  prefill: { name?: string; email?: string; contact?: string };
  onPaid: () => void;
  onDismiss?: () => void;
}) {
  await loadScript();
  if (!window.Razorpay) throw new Error("Could not reach Razorpay.");
  const checkout = new window.Razorpay({
    key: keyId,
    subscription_id: subscriptionId,
    name: "Sahaya",
    description: "Membership · ₹99 a month",
    prefill,
    theme: { color: "#728156" },
    handler: () => onPaid(),
    modal: { ondismiss: () => onDismiss?.() },
  });
  checkout.open();
}
