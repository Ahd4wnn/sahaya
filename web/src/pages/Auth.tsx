import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  House,
  Mail,
  Phone,
  type LucideIcon,
} from "lucide-react";

import { TestingCode } from "@/components/TestingCode";
import { Button, buttonClass } from "@/components/kit/Button";
import { ChipToggle, Field, Segmented, TextInput } from "@/components/kit/Form";
import { Surface } from "@/components/kit/Surface";
import {
  useAuth,
  type Role,
  type Session,
  type SessionUser,
} from "@/features/auth/AuthContext";
import { api, ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type Channel = "phone" | "email";
type Side = Exclude<Role, "admin">;

interface StartResponse {
  sent: boolean;
  dev_code: string | null;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** How the backend words "new account, side not chosen yet"
 *  (backend/app/api/v1/auth.py, _AUTH_MESSAGES["role_required"]). */
const ROLE_REQUIRED = "Tell us whether";

/** Same-site paths only. `?next=//elsewhere.example` would otherwise send a
 *  freshly signed-in person wherever the link's author liked. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return null;
  }
  return raw;
}

function homeFor(user: SessionUser): string {
  if (user.role === "admin") return "/admin";
  if (user.role === "helper") return "/account";
  return "/";
}

function parseSide(value: string | null): Side | null {
  return value === "helper" || value === "hirer" ? value : null;
}

// ----------------------------------------------------------------- Google --

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let googleScript: Promise<void> | null = null;

function loadGoogle(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  googleScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleScript = null;
      reject(new Error("Google could not be reached."));
    };
    document.head.appendChild(script);
  });
  return googleScript;
}

/** Google's own button: its sign-in only works from the button it renders. */
function GoogleButton({
  onCredential,
  disabled,
}: {
  onCredential: (idToken: string) => void;
  disabled: boolean;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const latest = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    latest.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGoogle().then(
      () => {
        const el = slot.current;
        if (cancelled || !el || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => latest.current(response.credential),
        });
        window.google.accounts.id.renderButton(el, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          width: Math.min(el.offsetWidth, 400),
        });
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID || failed) {
    return (
      <>
        <button type="button" disabled className={buttonClass("secondary", "md", "w-full")}>
          Continue with Google
        </button>
        <p className="mt-2 text-center text-[12px] text-ink-faint">
          {failed
            ? "Google could not be reached. Use your phone or email instead."
            : "Google sign-in switches on once a Google client ID is configured."}
        </p>
      </>
    );
  }

  return (
    <div
      ref={slot}
      aria-disabled={disabled}
      className={cn("flex min-h-11 justify-center", disabled && "pointer-events-none opacity-50")}
    />
  );
}

// ------------------------------------------------------------------ parts --

function Frame({
  title,
  subtitle,
  back,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  back?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-[480px] px-4 pb-16 pt-8 sm:pt-14">
      {back}
      <h1 className="font-display text-[clamp(1.9rem,4vw,2.25rem)] font-bold leading-tight tracking-[-0.025em] text-ink">
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>
      <Surface className="mt-7">{children}</Surface>
      {footer && <p className="mt-6 text-center text-[14px] text-ink-muted">{footer}</p>}
    </section>
  );
}

function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 mb-4 inline-flex h-11 items-center gap-1.5 rounded-full px-1 text-[14px] font-medium text-ink-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {children}
    </button>
  );
}

function SideCard({
  icon: Icon,
  title,
  body,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-4 rounded-[15px] bg-oat p-5 text-left ring-1 ring-transparent transition-shadow duration-200 hover:ring-field"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-moss text-on-moss">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-[18px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[14px] leading-relaxed text-ink-muted">{body}</span>
      </span>
    </button>
  );
}

/** Shown when a sign-in turns out to be a brand-new account: the backend
 *  needs to know which side it is on before it can create it. */
function NewAccountFields({
  side,
  onSide,
  name,
  onName,
  askName,
}: {
  side: Side | null;
  onSide: (side: Side) => void;
  name: string;
  onName: (name: string) => void;
  askName: boolean;
}) {
  return (
    <div className="rounded-[15px] bg-oat p-4">
      <p className="font-display text-[15px] font-semibold text-ink">You are new here</p>
      <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">
        Tell us which side you are on to finish making your account.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ChipToggle selected={side === "hirer"} onClick={() => onSide("hirer")}>
          I need help at home
        </ChipToggle>
        <ChipToggle selected={side === "helper"} onClick={() => onSide("helper")}>
          I am looking for work
        </ChipToggle>
      </div>
      {askName && (
        <Field className="mt-3" label="Your name" htmlFor="new-name">
          <TextInput
            id="new-name"
            autoComplete="name"
            value={name}
            maxLength={120}
            onChange={(event) => onName(event.target.value)}
          />
        </Field>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- page --

/**
 * One screen, three ways in: phone, email and Google.
 *
 * Phone is first and pre-selected. Many helpers have a phone and no email,
 * and this is the screen where we lose them if it feels like a form for
 * office workers. Where someone lands afterwards: `?next=` if it is a safe
 * same-site path, otherwise admins to the admin panel, helpers to their card,
 * families to the front page.
 */
export function Auth({ mode }: { mode: "signin" | "join" }) {
  const [params] = useSearchParams();
  const { user, adoptSession } = useAuth();
  const next = params.get("next");
  const joining = mode === "join";
  const keep = next ? `?next=${encodeURIComponent(next)}` : "";

  const [side, setSide] = useState<Side | null>(parseSide(params.get("as") ?? params.get("role")));
  const [channel, setChannel] = useState<Channel>(params.get("with") === "email" ? "email" : "phone");
  const [step, setStep] = useState<"identify" | "code">("identify");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [needsSide, setNeedsSide] = useState(false);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signed in -- including the moment a sign-in below succeeds -- means done.
  if (user) return <Navigate to={safeNext(next) ?? homeFor(user)} replace />;

  const askSide = joining || needsSide;
  const target = channel === "phone" ? { phone: identifier.trim() } : { email: identifier.trim() };

  function failed(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.isConflict && err.message.startsWith(ROLE_REQUIRED)) {
      setNeedsSide(true);
      setError(null);
      return;
    }
    setError(errorMessage(err, fallback));
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api<StartResponse>(`/auth/${channel}/start`, {
        method: "POST",
        body: target,
      });
      setDevCode(result.dev_code);
      setStep("code");
    } catch (err) {
      setError(errorMessage(err, "Could not send the code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (askSide && !side) {
      setError("Choose which side you are on first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const session = await api<Session>(`/auth/${channel}/verify`, {
        method: "POST",
        body: {
          ...target,
          code,
          ...(askSide && side ? { role: side, full_name: fullName.trim() } : {}),
        },
      });
      adoptSession(session);
    } catch (err) {
      failed(err, "Could not sign you in. Check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle(idToken: string) {
    setGoogleToken(idToken);
    setError(null);
    setBusy(true);
    try {
      const session = await api<Session>("/auth/google", {
        method: "POST",
        body: { id_token: idToken, ...(askSide && side ? { role: side } : {}) },
      });
      adoptSession(session);
    } catch (err) {
      failed(err, "Google sign-in did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Joining starts with the one question that changes everything after it.
  if (joining && !side) {
    return (
      <Frame
        title="Which brings you here?"
        subtitle="It decides your profile and what Sahaya shows you. One account is one side, so pick the one that fits."
        footer={
          <>
            Already have an account?{" "}
            <Link to={`/signin${keep}`} className="font-semibold text-moss hover:underline">
              Sign in
            </Link>
          </>
        }
      >
        <div className="space-y-3">
          <SideCard
            icon={House}
            title="I need help at home"
            body="Browse helpers near you and get in touch."
            onClick={() => setSide("hirer")}
          />
          <SideCard
            icon={BriefcaseBusiness}
            title="I am looking for work"
            body="Build your card and get found by families."
            onClick={() => setSide("helper")}
          />
        </div>
      </Frame>
    );
  }

  const errorLine = error && (
    <p role="alert" className="text-[13px] leading-snug text-danger">
      {error}
    </p>
  );

  if (step === "code") {
    return (
      <Frame
        title="Enter your code"
        // "We sent" would be a lie while the code is on screen because there
        // is nothing to send it with.
        subtitle={
          devCode
            ? `A 6-digit code for ${identifier.trim()}. It works for 10 minutes.`
            : `We sent a 6-digit code to ${identifier.trim()}. It works for 10 minutes.`
        }
        back={
          <BackButton
            onClick={() => {
              setStep("identify");
              setCode("");
              setError(null);
            }}
          >
            Change {channel === "phone" ? "number" : "email"}
          </BackButton>
        }
      >
        <form onSubmit={verifyCode} className="space-y-4">
          {needsSide && (
            <NewAccountFields
              side={side}
              onSide={setSide}
              name={fullName}
              onName={setFullName}
              askName
            />
          )}

          <Field label="6-digit code" htmlFor="code">
            <TextInput
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              data-numeric
              className="h-14 text-center text-[24px] tracking-[0.4em] placeholder:tracking-[0.3em]"
            />
          </Field>

          {devCode && <TestingCode code={devCode} />}

          {errorLine}

          <Button type="submit" busy={busy} disabled={code.length < 4} className="w-full">
            Continue
          </Button>
        </form>
      </Frame>
    );
  }

  return (
    <Frame
      title={
        joining
          ? side === "helper"
            ? "Let's build your card"
            : "Find help near you"
          : "Welcome back"
      }
      subtitle="We will send you a one-time code. There is no password to remember."
      back={joining ? <BackButton onClick={() => setSide(null)}>Back</BackButton> : undefined}
      footer={
        joining ? (
          <>
            Already have an account?{" "}
            <Link to={`/signin${keep}`} className="font-semibold text-moss hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Sahaya?{" "}
            <Link to={`/join${keep}`} className="font-semibold text-moss hover:underline">
              Create an account
            </Link>
          </>
        )
      }
    >
      <Segmented
        id="auth-channel"
        label="How to sign in"
        value={channel}
        onChange={(next) => {
          setChannel(next);
          setIdentifier("");
          setError(null);
        }}
        options={[
          {
            value: "phone",
            label: (
              <>
                <Phone className="size-4" aria-hidden />
                Phone
              </>
            ),
          },
          {
            value: "email",
            label: (
              <>
                <Mail className="size-4" aria-hidden />
                Email
              </>
            ),
          },
        ]}
      />

      <form onSubmit={sendCode} className="mt-5 space-y-4">
        <Field
          label={channel === "phone" ? "Mobile number" : "Email address"}
          htmlFor="identifier"
          hint={channel === "phone" ? "Indian mobile numbers, with or without +91." : undefined}
        >
          <TextInput
            id="identifier"
            name={channel === "phone" ? "tel" : "email"}
            type={channel === "phone" ? "tel" : "email"}
            inputMode={channel === "phone" ? "numeric" : "email"}
            autoComplete={channel === "phone" ? "tel" : "email"}
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder={channel === "phone" ? "98470 12345" : "you@example.com"}
          />
        </Field>

        {joining && (
          <Field label="Your name" htmlFor="full-name">
            <TextInput
              id="full-name"
              autoComplete="name"
              required
              maxLength={120}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Fathima Nida"
            />
          </Field>
        )}

        {!googleToken && errorLine}

        <Button type="submit" busy={busy && !googleToken} disabled={!identifier.trim()} className="w-full">
          Send code
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[13px] text-ink-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {needsSide && googleToken ? (
        <div className="space-y-3">
          <NewAccountFields
            side={side}
            onSide={setSide}
            name=""
            onName={() => undefined}
            askName={false}
          />
          {errorLine}
          <Button
            className="w-full"
            busy={busy}
            disabled={!side}
            onClick={() => void signInWithGoogle(googleToken)}
          >
            Continue with Google
          </Button>
        </div>
      ) : (
        <>
          <GoogleButton onCredential={(token) => void signInWithGoogle(token)} disabled={busy} />
          {googleToken && errorLine && <div className="mt-3">{errorLine}</div>}
        </>
      )}
    </Frame>
  );
}
