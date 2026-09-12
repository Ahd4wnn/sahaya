import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, bootstrapSession, setTokens } from "@/lib/api";

export type Role = "admin" | "helper" | "hirer";

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  role: Role;
  email_verified: boolean;
  phone_verified: boolean;
}

export interface Session {
  user: SessionUser;
  tokens: { access_token: string; refresh_token: string };
  created: boolean;
  onboarding_step: number;
  has_active_subscription: boolean;
  /** Whether Ask Sahaya is configured on this server. */
  assistant_enabled: boolean;
}

interface AuthValue {
  user: SessionUser | null;
  onboardingStep: number;
  isSubscribed: boolean;
  /** False until a key is configured; the menu item and the Help page link
   *  then do not exist, instead of leading to a thread that answers 503. */
  assistantEnabled: boolean;
  /** Distinguishes "not signed in" from "we have not checked yet", so the nav
   *  does not flash a Sign-in button at a returning user mid-restore. */
  loading: boolean;
  adoptSession: (session: Session) => void;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [assistantEnabled, setAssistantEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const adoptSession = useCallback((session: Session) => {
    setTokens(session.tokens.access_token, session.tokens.refresh_token);
    setUser(session.user);
    setOnboardingStep(session.onboarding_step);
    setIsSubscribed(session.has_active_subscription);
    setAssistantEnabled(session.assistant_enabled);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<Session>("/auth/me");
      setUser(me.user);
      setOnboardingStep(me.onboarding_step);
      setIsSubscribed(me.has_active_subscription);
      setAssistantEnabled(me.assistant_enabled);
    } catch {
      setUser(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    const refresh = localStorage.getItem("sahaya.refresh");
    try {
      if (refresh) {
        await api<void>("/auth/logout", {
          method: "POST",
          body: { refresh_token: refresh },
        });
      }
    } catch {
      /* logout is best-effort; the local session goes either way */
    }
    setTokens(null, null);
    setUser(null);
    setIsSubscribed(false);
    setAssistantEnabled(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await bootstrapSession();
      if (restored && !cancelled) await refreshMe();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  const value = useMemo(
    () => ({
      user,
      onboardingStep,
      isSubscribed,
      assistantEnabled,
      loading,
      adoptSession,
      refreshMe,
      signOut,
    }),
    [
      user,
      onboardingStep,
      isSubscribed,
      assistantEnabled,
      loading,
      adoptSession,
      refreshMe,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/**
 * Whether to offer "Become a Helper".
 *
 * Signed-out visitors only. Someone here to hire is not looking for domestic
 * work, and a helper already holds the account it leads to -- so for both the
 * link is at best noise. `loading` is part of the test so a returning family
 * does not see the pill flash past during session restore, the same reason
 * ProfileMenu renders a skeleton first.
 */
export function useShowBecomeHelper(): boolean {
  const { user, loading } = useAuth();
  return !loading && !user;
}
