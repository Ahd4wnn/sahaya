import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRealtimeConnected } from "@/features/realtime/useRealtime";
import { api, buildQuery } from "@/lib/api";
import { realtime } from "@/lib/realtime";

/**
 * Chat. Backend: app/api/v1/messages.py.
 *
 * Delivery is the realtime socket; polling survives only as a fallback while
 * it is down, and relaxes to almost nothing while it is up. So a dropped
 * socket costs immediacy, never messages.
 */

export interface Participant {
  user_id: string;
  full_name: string;
  role: "helper" | "hirer" | "admin";
  helper_profile_id: string | null;
  photo_url: string | null;
  subscribed: boolean;
}

export type BlockedReason = "you_need_membership" | "they_need_membership" | null;

export interface Conversation {
  id: string;
  other: Participant;
  last_message: string | null;
  last_message_at: string | null;
  last_message_mine: boolean;
  unread: number;
  can_send: boolean;
  blocked_reason: BlockedReason;
  /** When the other person last read the thread -- drives "Seen". */
  other_read_at: string | null;
}

export interface ChatMessage {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  mine: boolean;
  /** Client-only: sent optimistically, not yet confirmed. */
  pending?: boolean;
  /** Client-only: the send failed; the bubble offers a retry. */
  failed?: boolean;
}

export interface MessagesPage {
  items: ChatMessage[];
  has_more: boolean;
}

export interface Unread {
  notifications: number;
  messages: number;
}

export function useConversations(enabled: boolean) {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<Conversation[]>("/me/conversations"),
    enabled,
    refetchInterval: live ? 5 * 60_000 : 30_000,
  });
}

export function useUnread(enabled: boolean) {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: ["unread"],
    queryFn: () => api<Unread>("/me/unread"),
    enabled,
    refetchInterval: live ? 5 * 60_000 : 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMessages(conversationId: string | undefined) {
  const live = useRealtimeConnected();
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => api<MessagesPage>(`/conversations/${conversationId}/messages`),
    enabled: Boolean(conversationId),
    refetchInterval: live ? false : 8_000,
  });
}

/** Prepend the page older than the oldest message on screen. */
export function useLoadOlder(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (before: string) =>
      api<MessagesPage>(
        `/conversations/${conversationId}/messages${buildQuery({ before })}`,
      ),
    onSuccess: (older) => {
      queryClient.setQueryData<MessagesPage>(["messages", conversationId], (page) =>
        page
          ? {
              items: [
                ...older.items.filter((m) => !page.items.some((p) => p.id === m.id)),
                ...page.items,
              ],
              has_more: older.has_more,
            }
          : older,
      );
    },
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: { helper_profile_id?: string; user_id?: string }) =>
      api<Conversation>("/conversations", { method: "POST", body: target }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

/**
 * Send, optimistically.
 *
 * The bubble appears the instant Send is pressed, marked pending. The socket
 * may deliver the confirmed message before this request resolves, so the
 * success path de-duplicates by id rather than blindly appending.
 */
export function useSendMessage(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const key = ["messages", conversationId];

  return useMutation({
    mutationFn: ({ body }: { body: string; tempId: string }) =>
      api<ChatMessage>(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: { body },
      }),

    onMutate: ({ body, tempId }) => {
      queryClient.setQueryData<MessagesPage>(key, (page) => ({
        has_more: page?.has_more ?? false,
        items: [
          ...(page?.items ?? []).filter((m) => m.id !== tempId),
          {
            id: tempId,
            sender_id: null,
            body,
            created_at: new Date().toISOString(),
            mine: true,
            pending: true,
          },
        ],
      }));
    },

    onSuccess: (sent, { tempId }) => {
      queryClient.setQueryData<MessagesPage>(key, (page) => {
        if (!page) return page;
        const alreadyDelivered = page.items.some((m) => m.id === sent.id);
        return {
          ...page,
          items: alreadyDelivered
            ? page.items.filter((m) => m.id !== tempId)
            : page.items.map((m) => (m.id === tempId ? sent : m)),
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },

    onError: (_error, { tempId }) => {
      queryClient.setQueryData<MessagesPage>(key, (page) =>
        page
          ? {
              ...page,
              items: page.items.map((m) =>
                m.id === tempId ? { ...m, pending: false, failed: true } : m,
              ),
            }
          : page,
      );
    },
  });
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      api<void>(`/conversations/${conversationId}/read`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["unread"] });
    },
  });
}

/**
 * Whether the other person is typing in this thread.
 *
 * Driven entirely by the socket, and self-clearing: the indicator drops after
 * a few seconds without a fresh event, so a closed laptop never leaves
 * "typing..." on screen forever.
 */
export function useTypingIndicator(conversationId: string | undefined) {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    let timer: number | undefined;
    const unsubscribe = realtime.subscribe((event) => {
      if (event.type === "typing" && event.data.conversation_id === conversationId) {
        setTyping(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setTyping(false), 4000);
      }
      if (event.type === "message" && event.data.conversation_id === conversationId) {
        setTyping(false);
      }
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      setTyping(false);
    };
  }, [conversationId]);

  return typing;
}

/** Announce typing, at most once every 2.5 seconds per thread. */
let lastTypingSent = 0;
export function sendTyping(conversationId: string) {
  const now = Date.now();
  if (now - lastTypingSent < 2500) return;
  lastTypingSent = now;
  realtime.send({ type: "typing", conversation_id: conversationId });
}
