import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SessionUser } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";

/**
 * The signed-in person's own account: the family profile, settings, contact
 * details, verification documents and membership.
 * Backend: hirers.py, me.py, documents.py, billing.py.
 */

// --------------------------------------------------------------- family profile
export interface HirerMe {
  full_name: string;
  household_size: number | null;
  about: string;
  district: string | null;
  district_name: string | null;
  town: string | null;
  town_name: string | null;
  landmark: string;
  rating_avg: number | null;
  rating_count: number;
  has_active_subscription: boolean;
}

export type HirerPatch = Partial<
  Pick<HirerMe, "full_name" | "household_size" | "about" | "district" | "town" | "landmark">
>;

export function useHirerMe(enabled: boolean) {
  return useQuery({
    queryKey: ["hirer-me"],
    queryFn: () => api<HirerMe>("/hirers/me"),
    enabled,
  });
}

export function useUpdateHirerMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: HirerPatch) =>
      api<HirerMe>("/hirers/me", { method: "PATCH", body: patch }),
    onSuccess: (data) => queryClient.setQueryData(["hirer-me"], data),
  });
}

// --------------------------------------------------------------------- settings
export type NotificationPrefs = Record<
  "hire_requests" | "reviews" | "verification" | "tips",
  boolean
>;

export function useSettings(enabled: boolean) {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ notification_prefs: NotificationPrefs }>("/me/settings"),
    enabled,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<NotificationPrefs>) =>
      api<{ notification_prefs: NotificationPrefs }>("/me/settings", {
        method: "PATCH",
        body: { notification_prefs: prefs },
      }),
    // Optimistic: a toggle that waits for a round trip feels broken.
    onMutate: async (prefs) => {
      await queryClient.cancelQueries({ queryKey: ["settings"] });
      const previous = queryClient.getQueryData<{ notification_prefs: NotificationPrefs }>([
        "settings",
      ]);
      if (previous) {
        queryClient.setQueryData(["settings"], {
          notification_prefs: { ...previous.notification_prefs, ...prefs },
        });
      }
      return { previous };
    },
    onError: (_error, _prefs, context) => {
      if (context?.previous) queryClient.setQueryData(["settings"], context.previous);
    },
    onSuccess: (data) => queryClient.setQueryData(["settings"], data),
  });
}

export function useUpdateName() {
  return useMutation({
    mutationFn: (full_name: string) =>
      api<SessionUser>("/me", { method: "PATCH", body: { full_name } }),
  });
}

/** Exactly one of email or phone. */
export type ContactTarget = { email: string } | { phone: string };

export function useStartContactChange() {
  return useMutation({
    mutationFn: (target: ContactTarget) =>
      api<{ sent: boolean; dev_code: string | null }>("/me/contact/start", {
        method: "POST",
        body: target,
      }),
  });
}

export function useVerifyContactChange() {
  return useMutation({
    mutationFn: (payload: ContactTarget & { code: string }) =>
      api<SessionUser>("/me/contact/verify", { method: "POST", body: payload }),
  });
}

export function useDeactivate() {
  return useMutation({
    mutationFn: () => api<void>("/me/deactivate", { method: "POST" }),
  });
}

// -------------------------------------------------------------------- documents
export type DocumentKind = "id_proof" | "address_proof" | "police_verification";
export type DocumentStatus = "pending" | "approved" | "rejected";

export interface VerificationDocument {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  review_note: string;
  created_at: string;
}

export function useMyDocuments(enabled: boolean) {
  return useQuery({
    queryKey: ["documents"],
    queryFn: () => api<VerificationDocument[]>("/me/documents"),
    enabled,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, file }: { kind: DocumentKind; file: File }) => {
      const form = new FormData();
      form.append("kind", kind);
      form.append("file", file);
      return api<VerificationDocument>("/me/documents", { method: "POST", body: form });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["helper-me"] });
    },
  });
}

// ------------------------------------------------------------------- membership
export interface Membership {
  status: string | null;
  current_end: string | null;
  is_active: boolean;
  razorpay_subscription_id: string | null;
  razorpay_key_id: string | null;
  /** Renewal switched off. Access still runs to current_end. */
  cancelled_at: string | null;
}

export function useMembership(enabled: boolean) {
  return useQuery({
    queryKey: ["membership"],
    queryFn: () => api<Membership>("/billing/me"),
    enabled,
  });
}

export function useSubscribe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<Membership>("/billing/subscribe", { method: "POST" }),
    onSuccess: (data) => queryClient.setQueryData(["membership"], data),
  });
}

/** Stop renewing. Days already paid for are kept. */
export function useCancelMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<Membership>("/billing/cancel", { method: "POST" }),
    onSuccess: (data) => queryClient.setQueryData(["membership"], data),
  });
}
