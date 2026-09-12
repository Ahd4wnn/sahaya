import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, buildQuery } from "@/lib/api";

/**
 * Ask Sahaya. Backend: app/api/v1/assistant.py.
 *
 * One query holds the whole thread and the two facts the rest of the UI needs
 * from it: whether the assistant is configured at all, and how many messages
 * are left today. `enabled: false` is the normal state of an install with no
 * API key, and the chat list uses it to decide whether the pinned row exists.
 */

export interface AssistantAction {
  kind: "message_helper";
  helper_profile_id: string;
  helper_name: string;
  service_name: string;
  draft: string;
}

export interface AssistantTurn {
  id: string;
  role: "user" | "assistant";
  body: string;
  /** What the assistant offered. Nothing here has happened yet. */
  actions: AssistantAction[];
  created_at: string;
  /** Client-only: shown optimistically, not yet answered. */
  pending?: boolean;
  /** Client-only: the request failed; the bubble offers a retry. */
  failed?: boolean;
}

export interface AssistantThreadData {
  enabled: boolean;
  greeting: string;
  messages: AssistantTurn[];
  has_more: boolean;
  remaining_today: number;
  daily_limit: number;
}

interface AskResponse {
  question: AssistantTurn;
  answer: AssistantTurn;
  remaining_today: number;
}

const KEY = ["assistant"];

export function useAssistant(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<AssistantThreadData>("/me/assistant"),
    enabled,
    // Nothing arrives here unprompted -- every turn is a reply to something
    // this person typed -- so there is nothing to poll for.
    staleTime: 60_000,
  });
}

/** Prepend the page older than the oldest turn on screen. */
export function useLoadOlderTurns() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (before: string) =>
      api<AssistantThreadData>(`/me/assistant${buildQuery({ before })}`),
    onSuccess: (older) => {
      queryClient.setQueryData<AssistantThreadData>(KEY, (thread) =>
        thread
          ? {
              ...thread,
              messages: [
                ...older.messages.filter(
                  (m) => !thread.messages.some((existing) => existing.id === m.id),
                ),
                ...thread.messages,
              ],
              has_more: older.has_more,
            }
          : older,
      );
    },
  });
}

/**
 * Ask a question.
 *
 * The person's bubble appears immediately, marked pending, and is replaced by
 * the stored pair when the answer lands -- the same shape as sending a chat
 * message. On failure the bubble stays, marked failed, and the text is still
 * in `body` for a retry: the server stored nothing, so retrying is safe rather
 * than a risk of asking twice.
 */
export function useAskAssistant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ body }: { body: string; tempId: string }) =>
      api<AskResponse>("/me/assistant/messages", { method: "POST", body: { body } }),

    onMutate: ({ body, tempId }) => {
      queryClient.setQueryData<AssistantThreadData>(KEY, (thread) =>
        thread
          ? {
              ...thread,
              messages: [
                ...thread.messages.filter((m) => m.id !== tempId),
                {
                  id: tempId,
                  role: "user",
                  body,
                  actions: [],
                  created_at: new Date().toISOString(),
                  pending: true,
                },
              ],
            }
          : thread,
      );
    },

    onSuccess: (result, { tempId }) => {
      queryClient.setQueryData<AssistantThreadData>(KEY, (thread) =>
        thread
          ? {
              ...thread,
              messages: [
                ...thread.messages.filter((m) => m.id !== tempId),
                result.question,
                result.answer,
              ],
              remaining_today: result.remaining_today,
            }
          : thread,
      );
    },

    onError: (_error, { tempId }) => {
      queryClient.setQueryData<AssistantThreadData>(KEY, (thread) =>
        thread
          ? {
              ...thread,
              messages: thread.messages.map((m) =>
                m.id === tempId ? { ...m, pending: false, failed: true } : m,
              ),
            }
          : thread,
      );
    },
  });
}

/** Start a fresh conversation. The old turns stop being shown and stop being
 *  sent to the model; today's usage still counts. */
export function useResetAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/me/assistant/reset", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * Act on a proposal: open the chat with this helper and send the draft.
 *
 * Two ordinary calls, the same two the UI makes when a family messages a
 * helper from their profile. Nothing about the assistant is privileged here --
 * a lapsed membership fails at POST /conversations with its own 402 and its
 * own wording, exactly as it would anywhere else.
 */
export function useSendProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action }: { action: AssistantAction }) => {
      const conversation = await api<{ id: string }>("/conversations", {
        method: "POST",
        body: { helper_profile_id: action.helper_profile_id },
      });
      await api(`/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: { body: action.draft },
      });
      return conversation.id;
    },
    onSuccess: (conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["unread"] });
    },
  });
}
