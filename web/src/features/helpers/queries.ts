import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, buildQuery } from "@/lib/api";
import type {
  BrowseFilters,
  BrowseResponse,
  District,
  HelperCardData,
  HelperDetailData,
  Taxonomy,
  Town,
} from "./types";

/** Geography is the same for everyone and does not change at runtime. */
const STATIC_OPTIONS = { staleTime: 60 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 };

/**
 * Services are admin-managed (Admin -> Categories), so a rename, reorder or
 * archive has to reach visitors within minutes, not an hour. The admin's own
 * edits invalidate ["taxonomy"] directly, so they see the change instantly.
 */
const TAXONOMY_OPTIONS = { staleTime: 5 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 };

export function useTaxonomy() {
  return useQuery({
    queryKey: ["taxonomy"],
    queryFn: () => api<Taxonomy>("/taxonomy"),
    ...TAXONOMY_OPTIONS,
  });
}

/** The services an admin has put in the site header, in their order. */
export function useNavServices() {
  const { data } = useTaxonomy();
  return (data?.services ?? []).filter((service) => service.show_in_nav);
}

export function useDistricts() {
  return useQuery({
    queryKey: ["districts"],
    queryFn: () => api<District[]>("/geo/districts"),
    ...STATIC_OPTIONS,
  });
}

export function useTowns(district?: string) {
  return useQuery({
    queryKey: ["towns", district],
    queryFn: () => api<Town[]>(`/geo/towns${buildQuery({ district })}`),
    enabled: Boolean(district),
    ...STATIC_OPTIONS,
  });
}

export function useBrowse(filters: BrowseFilters) {
  return useQuery({
    queryKey: ["helpers", filters],
    queryFn: () =>
      api<BrowseResponse>(`/helpers${buildQuery(filters as Record<string, unknown>)}`),
    placeholderData: (previous) => previous,
  });
}

export function useHelper(id: string | undefined) {
  return useQuery({
    queryKey: ["helper", id],
    queryFn: () => api<HelperDetailData>(`/helpers/${id}`),
    enabled: Boolean(id),
  });
}

// --- the helper's own profile -------------------------------------------- //

export interface HelperMe extends HelperCardData {
  bio: string;
  landmark: string;
  is_listed: boolean;
  onboarding_step: number;
  id_verification_status: "none" | "pending" | "verified" | "rejected";
  police_verification_status: "none" | "pending" | "verified" | "rejected";
  has_active_subscription: boolean;
}

export interface HelperPatch {
  full_name?: string;
  service?: string;
  skills?: string[];
  headline?: string;
  bio?: string;
  experience_years?: number;
  wage_monthly_min?: number;
  wage_monthly_max?: number;
  shifts?: string[];
  hours_per_day?: number;
  willing_to_live_in?: boolean;
  languages?: string[];
  district?: string;
  /** null clears it -- sent when the district changes, so a town from the old
   *  district is never left attached to the new one. */
  town?: string | null;
  landmark?: string;
  onboarding_step?: number;
}

export interface PhotoResult {
  photo_url: string | null;
  cutout_url: string | null;
  cutout_status: "pending" | "done" | "failed";
  cutout_note: string;
}

export function useHelperMe(enabled = true) {
  return useQuery({
    queryKey: ["helper-me"],
    queryFn: () => api<HelperMe>("/helpers/me"),
    enabled,
    staleTime: 0,
  });
}

export function useUpdateHelperMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: HelperPatch) =>
      api<HelperMe>("/helpers/me", { method: "PATCH", body: patch }),
    // Write straight into the cache so the live card preview updates the moment
    // the server confirms, with no refetch flicker between steps.
    onSuccess: (data) => qc.setQueryData(["helper-me"], data),
  });
}

export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<PhotoResult>("/helpers/me/photo", { method: "POST", body: form });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["helper-me"] }),
  });
}
