import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, buildQuery } from "@/lib/api";

/**
 * The admin panel. Backend: app/api/v1/admin.py -- every route there is behind
 * require_admin and every change is written to the audit log.
 */

export interface AdminStats {
  users_by_role: Record<string, number>;
  signups_7d: number;
  helpers_listed: number;
  helpers_hidden: number;
  paying_members: number;
  comped_members: number;
  monthly_revenue_paise: number;
  hires_by_status: Record<string, number>;
  documents_pending: number;
  cutouts_failed: number;
  messages_7d: number;
}

export interface AdminDocument {
  id: string;
  kind: "id_proof" | "address_proof" | "police_verification" | "photo";
  status: "pending" | "approved" | "rejected";
  review_note: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_phone: string | null;
  helper_profile_id: string | null;
  content_type: string;
}

export interface AdminUserRow {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  role: "admin" | "helper" | "hirer";
  status: "active" | "suspended" | "deleted";
  created_at: string;
  subscribed: boolean;
  helper_profile_id: string | null;
}

export interface AdminHelperRow {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  service_name: string | null;
  district_name: string | null;
  is_listed: boolean;
  admin_hidden: boolean;
  id_verification_status: "none" | "pending" | "verified" | "rejected";
  police_verification_status: "none" | "pending" | "verified" | "rejected";
  cutout_status: "pending" | "done" | "failed";
  photo_url: string | null;
  cutout_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  created_at: string;
}

export interface AdminSubscriptionRow {
  id: string;
  user_id: string;
  user_name: string;
  user_phone: string | null;
  role: "admin" | "helper" | "hirer";
  plan_code: string;
  status: string;
  current_start: string | null;
  current_end: string | null;
  cancelled_at: string | null;
  is_comp: boolean;
  is_live: boolean;
}

export interface AdminService {
  id: string;
  slug: string;
  name: string;
  name_ml: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  show_in_nav: boolean;
  nav_label: string;
  helper_count: number;
  listed_count: number;
}

export interface AdminSkill {
  id: string;
  slug: string;
  name: string;
  name_ml: string;
  sort_order: number;
  is_active: boolean;
  helper_count: number;
  listed_count: number;
}

export interface AdminAction {
  id: string;
  admin_name: string;
  action: string;
  target_type: string;
  target_id: string | null;
  note: string;
  created_at: string;
}

interface Page<T> {
  items: T[];
  total: number;
}

// ------------------------------------------------------------------ dashboard
export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api<AdminStats>("/admin/stats"),
  });
}

export function useAuditLog(limit = 100) {
  return useQuery({
    queryKey: ["admin", "actions", limit],
    queryFn: () => api<AdminAction[]>(`/admin/actions${buildQuery({ limit })}`),
  });
}

/** Every admin write changes the dashboard and the audit log. */
function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return (...keys: string[]) => {
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: ["admin", key] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "actions"] });
  };
}

// -------------------------------------------------------------- verification
export function useAdminDocuments(status: AdminDocument["status"] | "all") {
  return useQuery({
    queryKey: ["admin", "documents", status],
    queryFn: () =>
      api<AdminDocument[]>(
        `/admin/documents${buildQuery({ status: status === "all" ? "" : status })}`,
      ),
  });
}

export function useDocumentDecision() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: "approve" | "reject"; note: string }) =>
      api<AdminDocument>(`/admin/documents/${id}`, {
        method: "PATCH",
        body: { decision, note },
      }),
    onSuccess: () => invalidate("documents", "helpers"),
  });
}

// --------------------------------------------------------------------- users
export interface UserFilters {
  q?: string;
  role?: AdminUserRow["role"];
  status?: AdminUserRow["status"];
  offset?: number;
}

export function useAdminUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ["admin", "users", filters],
    queryFn: () =>
      api<Page<AdminUserRow>>(`/admin/users${buildQuery({ ...filters, limit: 50 })}`),
    placeholderData: keepPreviousData,
  });
}

export function useSetUserStatus() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: "active" | "suspended"; note: string }) =>
      api<AdminUserRow>(`/admin/users/${id}`, { method: "PATCH", body: { status, note } }),
    onSuccess: () => invalidate("users", "helpers"),
  });
}

// ------------------------------------------------------------------- helpers
export function useAdminHelpers(filters: { q?: string; hidden?: boolean; offset?: number }) {
  return useQuery({
    queryKey: ["admin", "helpers", filters],
    queryFn: () =>
      api<Page<AdminHelperRow>>(`/admin/helpers${buildQuery({ ...filters, limit: 50 })}`),
    placeholderData: keepPreviousData,
  });
}

export function useModerateHelper() {
  const invalidate = useInvalidateAdmin();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden, note }: { id: string; hidden: boolean; note: string }) =>
      api<AdminHelperRow>(`/admin/helpers/${id}`, { method: "PATCH", body: { hidden, note } }),
    onSuccess: () => {
      invalidate("helpers");
      // The public grid changes too.
      void queryClient.invalidateQueries({ queryKey: ["browse"] });
    },
  });
}

export function useCutoutQueue() {
  return useQuery({
    queryKey: ["admin", "cutouts"],
    queryFn: () => api<AdminHelperRow[]>("/admin/cutouts"),
  });
}

export function useRecutout() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ helper: AdminHelperRow; ok: boolean; note: string }>(
        `/admin/helpers/${id}/recutout`,
        { method: "POST" },
      ),
    onSuccess: () => invalidate("cutouts", "helpers"),
  });
}

// ------------------------------------------------------------- subscriptions
export function useAdminSubscriptions(filters: { q?: string; live?: boolean; offset?: number }) {
  return useQuery({
    queryKey: ["admin", "subscriptions", filters],
    queryFn: () =>
      api<Page<AdminSubscriptionRow>>(
        `/admin/subscriptions${buildQuery({ ...filters, limit: 50 })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useCompMembership() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ userId, days, note }: { userId: string; days: number; note: string }) =>
      api<AdminSubscriptionRow>(`/admin/users/${userId}/comp`, {
        method: "POST",
        body: { days, note },
      }),
    onSuccess: () => invalidate("subscriptions", "users"),
  });
}

export function useCancelSubscription() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api<AdminSubscriptionRow>(`/admin/subscriptions/${id}/cancel`, {
        method: "POST",
        body: { note },
      }),
    onSuccess: () => invalidate("subscriptions", "users"),
  });
}

// ---------------------------------------------------------------- categories
export function useAdminServices() {
  return useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => api<AdminService[]>("/admin/services"),
  });
}

/** Taxonomy edits change the public front page, so they invalidate the
 *  taxonomy too -- the admin sees their change on the home page instantly. */
function useInvalidateTaxonomy(key: "services" | "skills") {
  const invalidate = useInvalidateAdmin();
  const queryClient = useQueryClient();
  return () => {
    invalidate(key);
    void queryClient.invalidateQueries({ queryKey: ["taxonomy"] });
  };
}

export interface ServiceDraft {
  name: string;
  name_ml: string;
  icon: string;
  show_in_nav: boolean;
  nav_label: string;
}

export function useCreateService() {
  const invalidate = useInvalidateTaxonomy("services");
  return useMutation({
    mutationFn: (draft: ServiceDraft & { slug: string }) =>
      api<AdminService>("/admin/services", { method: "POST", body: draft }),
    onSuccess: invalidate,
  });
}

export function useUpdateService() {
  const invalidate = useInvalidateTaxonomy("services");
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<ServiceDraft> & { id: string; is_active?: boolean }) =>
      api<AdminService>(`/admin/services/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });
}

export function useReorderServices() {
  const invalidate = useInvalidateTaxonomy("services");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<AdminService[]>("/admin/services/reorder", { method: "POST", body: { ids } }),
    onSuccess: (services) => {
      queryClient.setQueryData(["admin", "services"], services);
      invalidate();
    },
  });
}

// -------------------------------------------------------------------- skills
export function useAdminSkills() {
  return useQuery({
    queryKey: ["admin", "skills"],
    queryFn: () => api<AdminSkill[]>("/admin/skills"),
  });
}

export interface SkillDraft {
  name: string;
  name_ml: string;
}

export function useCreateSkill() {
  const invalidate = useInvalidateTaxonomy("skills");
  return useMutation({
    mutationFn: (draft: SkillDraft & { slug: string }) =>
      api<AdminSkill>("/admin/skills", { method: "POST", body: draft }),
    onSuccess: invalidate,
  });
}

export function useUpdateSkill() {
  const invalidate = useInvalidateTaxonomy("skills");
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<SkillDraft> & { id: string; is_active?: boolean }) =>
      api<AdminSkill>(`/admin/skills/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });
}

export function useReorderSkills() {
  const invalidate = useInvalidateTaxonomy("skills");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<AdminSkill[]>("/admin/skills/reorder", { method: "POST", body: { ids } }),
    onSuccess: (skills) => {
      queryClient.setQueryData(["admin", "skills"], skills);
      invalidate();
    },
  });
}
