import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { SubscribeButton } from "@/components/SubscribeButton";
import { TestingCode } from "@/components/TestingCode";
import { Button } from "@/components/kit/Button";
import { ConfirmDialog, Dialog } from "@/components/kit/Dialog";
import { Field, Switch, TextInput } from "@/components/kit/Form";
import {
  PageShell,
  SectionHeading,
  Skeleton,
  StatusPill,
  Surface,
} from "@/components/kit/Surface";
import {
  useCancelMembership,
  useDeactivate,
  useMembership,
  useSettings,
  useStartContactChange,
  useUpdateName,
  useUpdateSettings,
  useVerifyContactChange,
  type ContactTarget,
  type NotificationPrefs,
} from "@/features/account/queries";
import { useAuth, type Role } from "@/features/auth/AuthContext";
import { errorMessage } from "@/lib/api";
import { longDate } from "@/lib/time";

/**
 * Settings. Backend: me.py (name, contact, prefs, deactivate), billing.py
 * (membership). A new phone number or email is never trusted as typed: it
 * goes through the same one-time-code check as signing in.
 */

// ---------------------------------------------------------------- account --

function ContactDialog({ kind, onClose }: { kind: "phone" | "email"; onClose: () => void }) {
  const { refreshMe } = useAuth();
  const start = useStartContactChange();
  const verify = useVerifyContactChange();
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"enter" | "code">("enter");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target: ContactTarget = kind === "phone" ? { phone: value.trim() } : { email: value.trim() };
  const noun = kind === "phone" ? "number" : "email";

  function send() {
    setError(null);
    start.mutate(target, {
      onSuccess: (result) => {
        setDevCode(result.dev_code);
        setStep("code");
      },
      onError: (e) => setError(errorMessage(e, "Could not send the code. Try again.")),
    });
  }

  function confirm() {
    setError(null);
    verify.mutate(
      { ...target, code },
      {
        onSuccess: async () => {
          await refreshMe();
          onClose();
        },
        onError: (e) => setError(errorMessage(e, "That code did not work. Try again.")),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={kind === "phone" ? "Change your mobile number" : "Change your email"}
      description={
        step === "enter"
          ? `We will send a code to the new ${noun} to check it is yours. You then sign in with it.`
          : `Enter the code we sent to ${value.trim()}.`
      }
      footer={
        step === "enter" ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button busy={start.isPending} disabled={!value.trim()} onClick={send}>
              Send code
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep("enter")}>
              Back
            </Button>
            <Button busy={verify.isPending} disabled={code.length < 4} onClick={confirm}>
              Confirm
            </Button>
          </>
        )
      }
    >
      {step === "enter" ? (
        <Field
          label={kind === "phone" ? "New mobile number" : "New email address"}
          htmlFor="contact-value"
          error={error}
        >
          <TextInput
            id="contact-value"
            type={kind === "phone" ? "tel" : "email"}
            inputMode={kind === "phone" ? "numeric" : "email"}
            autoComplete={kind === "phone" ? "tel" : "email"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
      ) : (
        <>
          <Field label="6-digit code" htmlFor="contact-code" error={error}>
            <TextInput
              id="contact-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              data-numeric
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              className="text-center text-[20px] tracking-[0.35em]"
            />
          </Field>
          {devCode && (
            <div className="mt-3">
              <TestingCode code={devCode} />
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

function ContactRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[15px] bg-oat px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">{label}</p>
        <p data-numeric className={value ? "truncate text-[15px] text-ink" : "text-[15px] text-ink-faint"}>
          {value ?? "Not added"}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onChange}>
        {value ? "Change" : "Add"}
      </Button>
    </div>
  );
}

function AccountSection() {
  const { user, refreshMe } = useAuth();
  const updateName = useUpdateName();
  const [name, setName] = useState<string | null>(null);
  const [editing, setEditing] = useState<"phone" | "email" | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;
  const value = name ?? user.full_name;
  const changed = value.trim().length > 0 && value.trim() !== user.full_name;

  function save() {
    updateName.mutate(value.trim(), {
      onSuccess: async () => {
        await refreshMe();
        setName(null);
        setSaved(true);
      },
    });
  }

  return (
    <section id="account" className="scroll-mt-24">
      <Surface>
        <SectionHeading
          title="Account"
          description="How you sign in, and the name families and helpers see."
        />
        <div className="mt-5 space-y-4">
          <Field
            label="Your name"
            htmlFor="settings-name"
            error={updateName.isError ? errorMessage(updateName.error, "Could not save your name.") : null}
            hint={saved ? "Saved." : undefined}
          >
            <div className="flex gap-2">
              <TextInput
                id="settings-name"
                autoComplete="name"
                maxLength={120}
                value={value}
                onChange={(event) => {
                  setName(event.target.value);
                  setSaved(false);
                }}
              />
              <Button onClick={save} disabled={!changed} busy={updateName.isPending}>
                Save
              </Button>
            </div>
          </Field>
          <ContactRow label="Mobile number" value={user.phone} onChange={() => setEditing("phone")} />
          <ContactRow label="Email" value={user.email} onChange={() => setEditing("email")} />
        </div>
      </Surface>
      {editing && <ContactDialog key={editing} kind={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

// ---------------------------------------------------------- notifications --

const PREFS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  {
    key: "hire_requests",
    label: "Hire requests",
    description: "New requests, and replies to the ones you sent.",
  },
  { key: "reviews", label: "Reviews", description: "When someone reviews you." },
  {
    key: "verification",
    label: "Verification",
    description: "When your documents have been checked.",
  },
  {
    key: "tips",
    label: "Profile tips",
    description: "Occasional suggestions for getting found more often.",
  },
];

function NotificationsSection() {
  const { user } = useAuth();
  const settings = useSettings(Boolean(user));
  const update = useUpdateSettings();
  const prefs = settings.data?.notification_prefs;

  return (
    <section id="notifications" className="scroll-mt-24">
      <Surface>
        <SectionHeading
          title="Notifications"
          description="They arrive in the pinned Sahaya thread in your messages."
        />
        {settings.isLoading ? (
          <Skeleton className="mt-5 h-48" />
        ) : (
          <div className="mt-3 divide-y divide-line-soft">
            {PREFS.map((pref) => (
              <Switch
                key={pref.key}
                checked={prefs?.[pref.key] ?? false}
                disabled={!prefs}
                onChange={(next) => update.mutate({ [pref.key]: next })}
                label={pref.label}
                description={pref.description}
              />
            ))}
          </div>
        )}
        <p className="mt-3 text-[13px] leading-relaxed text-ink-faint">
          Membership and account notices are always sent, because they change what you can do
          on Sahaya.
        </p>
        {update.isError && (
          <p role="alert" className="mt-2 text-[13px] text-danger">
            That change did not save. Try again.
          </p>
        )}
      </Surface>
    </section>
  );
}

// ------------------------------------------------------------- membership --

function MembershipSection() {
  const { user, refreshMe } = useAuth();
  const membership = useMembership(Boolean(user));
  const cancel = useCancelMembership();
  const [confirming, setConfirming] = useState(false);
  const m = membership.data;
  const helper = user?.role === "helper";

  return (
    <section id="membership" className="scroll-mt-24">
      <Surface>
        <SectionHeading
          title="Membership"
          description={
            helper
              ? "₹99 a month. It keeps your card in search and lets families reach you."
              : "₹99 a month. It unlocks messages, hire requests and contact details."
          }
        />
        {membership.isLoading ? (
          <Skeleton className="mt-5 h-24" />
        ) : m?.is_active ? (
          <div className="mt-5 rounded-[15px] bg-oat p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="good">Active</StatusPill>
              {m.cancelled_at && <StatusPill tone="warn">Renewal off</StatusPill>}
            </div>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
              {m.current_end
                ? m.cancelled_at
                  ? `It stays active until ${longDate(m.current_end)}, then ends. Start a new membership after that to keep going.`
                  : `Renews on ${longDate(m.current_end)}.`
                : "Your membership is active."}
            </p>
            {!m.cancelled_at && (
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => setConfirming(true)}>
                Turn off renewal
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-5">
            <p className="text-[14px] leading-relaxed text-ink-muted">
              You do not have an active membership.
            </p>
            <SubscribeButton className="mt-3" />
          </div>
        )}
      </Surface>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          cancel.mutate(undefined, {
            onSuccess: () => {
              setConfirming(false);
              void refreshMe();
            },
          })
        }
        busy={cancel.isPending}
        title="Turn off renewal?"
        description={
          m?.current_end
            ? `You keep everything until ${longDate(m.current_end)}. After that, messages and contact details lock again${helper ? " and your card leaves search" : ""}.`
            : "Your membership will not renew."
        }
        confirmLabel="Turn off renewal"
      >
        {cancel.isError && (
          <p role="alert" className="text-[13px] text-danger">
            {errorMessage(cancel.error, "That did not go through. Try again.")}
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}

// ---------------------------------------------------------------- privacy --

function PrivacySection({ role }: { role: Role }) {
  const points =
    role === "helper"
      ? [
          "Your card is public: anyone can browse your photo, skills, wage and reviews.",
          "Your phone number and email are shown only to families with an active membership.",
          "Your ID documents are private. Only the Sahaya team can open them, and every view is logged.",
          "Messages are between you and the family you are talking to.",
        ]
      : role === "hirer"
        ? [
            "Your family profile is not public. Helpers see your name when you message them or send a request.",
            "Reviews are signed with a first name and initial, never a full name.",
            "Messages are between you and the helper you are talking to.",
          ]
        : [
            "Every change made from the admin panel, and every ID document opened, is written to the audit log.",
          ];

  return (
    <section id="privacy" className="scroll-mt-24">
      <Surface>
        <SectionHeading title="Privacy" description="Who can see what." />
        <ul className="mt-4 space-y-2.5">
          {points.map((point) => (
            <li key={point} className="flex gap-3 text-[14px] leading-relaxed text-ink-muted">
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-sage" />
              {point}
            </li>
          ))}
        </ul>
      </Surface>
    </section>
  );
}

// ------------------------------------------------------------ danger zone --

function DangerSection() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const deactivate = useDeactivate();
  const [open, setOpen] = useState(false);

  return (
    <section id="deactivate" className="scroll-mt-24">
      <Surface className="ring-1 ring-danger/20">
        <SectionHeading
          title="Deactivate account"
          description="Hides your profile and signs you out everywhere."
          action={
            <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
              Deactivate
            </Button>
          }
        />
      </Surface>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        danger
        busy={deactivate.isPending}
        title="Deactivate your account?"
        description="Your profile disappears from Sahaya and you are signed out on every device. You will not be able to sign in to this account again. If you have a membership, turn off its renewal first."
        confirmLabel="Deactivate"
        onConfirm={() =>
          deactivate.mutate(undefined, {
            onSuccess: async () => {
              await signOut();
              navigate("/", { replace: true });
            },
          })
        }
      >
        {deactivate.isError && (
          <p role="alert" className="text-[13px] text-danger">
            {errorMessage(deactivate.error, "That did not go through. Try again.")}
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}

// ------------------------------------------------------------------- page --

export function Settings() {
  const { user } = useAuth();
  const location = useLocation();

  // /settings#membership, from the profile menu, lands on that section.
  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [location.hash]);

  if (!user) return null;

  return (
    <PageShell title="Settings" subtitle="Your account, notifications and membership." width="narrow">
      <div className="space-y-6">
        <AccountSection />
        <NotificationsSection />
        {user.role !== "admin" && <MembershipSection />}
        <PrivacySection role={user.role} />
        <DangerSection />
      </div>
    </PageShell>
  );
}
