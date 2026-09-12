import { useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/AuthContext";
import type { MessagesPage } from "@/features/messages/queries";
import { realtime, type RealtimeEvent } from "@/lib/realtime";

/**
 * Keep the socket open while signed in, and turn its events into cache
 * updates. Mounted once, in Layout.
 *
 * A new message is appended straight into the open thread's cache rather than
 * triggering a refetch -- avoiding the round trip is the entire point of
 * having a socket. Lists and counts, which the event does not fully describe,
 * are invalidated instead.
 */
export function useRealtimeSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) {
      realtime.stop();
      return;
    }
    realtime.start();

    const unsubscribe = realtime.subscribe((event: RealtimeEvent) => {
      switch (event.type) {
        case "message": {
          const { conversation_id, message } = event.data;
          queryClient.setQueryData<MessagesPage>(
            ["messages", conversation_id],
            (page) => {
              if (!page || page.items.some((m) => m.id === message.id)) return page;
              return {
                ...page,
                items: [
                  ...page.items,
                  { ...message, mine: message.sender_id === user.id },
                ],
              };
            },
          );
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          void queryClient.invalidateQueries({ queryKey: ["unread"] });
          break;
        }
        case "read":
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
          void queryClient.invalidateQueries({ queryKey: ["unread"] });
          break;
        case "notification":
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["unread"] });
          // Most notifications are hire-request transitions.
          void queryClient.invalidateQueries({ queryKey: ["hires"] });
          break;
        case "assistant":
          // The reply was typed in another tab; refetch rather than patch, the
          // event carries only the id.
          void queryClient.invalidateQueries({ queryKey: ["assistant"] });
          break;
        case "typing":
          // Handled by the open thread's own subscription (useTypingIndicator).
          break;
      }
    });

    return unsubscribe;
  }, [user, queryClient]);
}

/** Whether the socket is up. Polling intervals relax while it is. */
export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(
    (onChange) => realtime.subscribeStatus(onChange),
    () => realtime.isConnected(),
    () => false,
  );
}
