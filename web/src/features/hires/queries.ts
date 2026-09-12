import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/** Hire requests and reviews. Backend: app/api/v1/hires.py, reviews.py. */

export type HireStatus = "pending" | "accepted" | "declined" | "withdrawn" | "completed";
export type HireAction = "accept" | "decline" | "withdraw" | "complete";

export interface Counterpart {
  user_id: string;
  full_name: string;
  role: "helper" | "hirer" | "admin";
  helper_profile_id: string | null;
  photo_url: string | null;
}

export interface Hire {
  id: string;
  status: HireStatus;
  message: string;
  created_at: string;
  responded_at: string | null;
  completed_at: string | null;
  i_am: "hirer" | "helper";
  counterpart: Counterpart;
  can_review: boolean;
  my_review_rating: number | null;
}

export interface Review {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  direction: "hirer_to_helper" | "helper_to_hirer";
  rater_name: string;
  rater_role: "helper" | "hirer" | "admin";
}

export function useMyHires(enabled: boolean) {
  return useQuery({
    queryKey: ["hires"],
    queryFn: () => api<Hire[]>("/me/hires"),
    enabled,
  });
}

export function useRequestHire(helperProfileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      api<Hire>(`/helpers/${helperProfileId}/hire`, {
        method: "POST",
        body: { message },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hires"] }),
  });
}

export function useHireAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: HireAction }) =>
      api<Hire>(`/hires/${id}`, { method: "PATCH", body: { action } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["hires"] }),
  });
}

export function useLeaveReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ hireId, rating, comment }: { hireId: string; rating: number; comment: string }) =>
      api<Review>(`/hires/${hireId}/review`, {
        method: "POST",
        body: { rating, comment },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["hires"] });
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}

export function useHelperReviews(helperProfileId: string | undefined) {
  return useQuery({
    queryKey: ["reviews", "helper", helperProfileId],
    queryFn: () => api<Review[]>(`/helpers/${helperProfileId}/reviews`),
    enabled: Boolean(helperProfileId),
  });
}

export function useUserReviews(userId: string | undefined) {
  return useQuery({
    queryKey: ["reviews", "user", userId],
    queryFn: () => api<Review[]>(`/users/${userId}/reviews`),
    enabled: Boolean(userId),
  });
}
