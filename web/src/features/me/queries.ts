import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRealtimeConnected } from "@/features/realtime/useRealtime";
import { api } from "@/lib/api";
import type { HelperCardData } from "@/features/helpers/types";

/** Saved helpers and alerts -- what the two header circles are wired to. */

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

export function useNotifications(enabled: boolean, limit = 20) {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: ["notifications", limit],
    queryFn: () => api<NotificationsResponse>(`/me/notifications?limit=${limit}`),
    enabled,
    // New notifications arrive over the realtime socket. This interval is only
    // the fallback for while it is down.
    refetchInterval: live ? 5 * 60_000 : 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/me/notifications/read", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["unread"] });
    },
  });
}

/**
 * Just the ids of saved helpers.
 *
 * The grid needs to know which of twenty-four cards are saved; fetching
 * twenty-four full profiles to answer that would be absurd, so this is its own
 * endpoint and the result is held as a Set.
 */
export function useFavoriteIds(enabled: boolean) {
  return useQuery({
    queryKey: ["favorite-ids"],
    queryFn: async () => {
      const data = await api<{ ids: string[] }>("/me/favorites/ids");
      return new Set(data.ids);
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useFavorites(enabled: boolean) {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: () => api<HelperCardData[]>("/me/favorites"),
    enabled,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) =>
      api<void>(`/me/favorites/${id}`, { method: saved ? "DELETE" : "PUT" }),

    // Optimistic, because a heart that waits for a round trip feels broken.
    // PUT and DELETE are both idempotent server-side, so a lost race settles
    // on the correct value rather than double-toggling.
    onMutate: async ({ id, saved }) => {
      await qc.cancelQueries({ queryKey: ["favorite-ids"] });
      const previous = qc.getQueryData<Set<string>>(["favorite-ids"]);
      const next = new Set(previous ?? []);
      if (saved) next.delete(id);
      else next.add(id);
      qc.setQueryData(["favorite-ids"], next);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(["favorite-ids"], context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["favorite-ids"] });
      void qc.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}
