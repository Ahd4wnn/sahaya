import { useParams } from "react-router";
import { MessagesSquare } from "lucide-react";

import { EmptyState } from "@/components/kit/Surface";
import { cn } from "@/lib/utils";
import { AssistantThread } from "./AssistantThread";
import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";
import { SahayaThread } from "./SahayaThread";

/**
 * Chat: two panes on desktop, list-then-thread on phones.
 *
 * Two of the ids are not conversations: `/messages/sahaya` is the pinned
 * notifications thread, and `/messages/assistant` is Ask Sahaya. Anything else
 * is a real thread between two people. The page is the window's height less
 * the page header, so the thread scrolls inside itself and the composer never
 * moves.
 */
export function Chat() {
  const { id } = useParams();

  return (
    <div className="mx-auto flex h-[calc(100dvh-68px)] w-full max-w-[1432px] gap-4 px-2 pb-2 md:h-[calc(100dvh-72px)] sm:px-6 sm:pb-6 xl:px-10">
      <aside
        aria-label="Conversations"
        className={cn(
          "min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-panel)] bg-paper md:flex md:w-[340px] md:shrink-0",
          id ? "hidden" : "flex",
        )}
      >
        <ConversationList activeId={id} />
      </aside>

      <section
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-panel)] bg-paper md:flex",
          id ? "flex" : "hidden",
        )}
      >
        {!id ? (
          <div className="m-auto">
            <EmptyState
              icon={MessagesSquare}
              title="Pick a conversation"
              body="Your updates from Sahaya are pinned at the top of the list, with Ask Sahaya just below."
            />
          </div>
        ) : id === "sahaya" ? (
          <SahayaThread />
        ) : id === "assistant" ? (
          <AssistantThread />
        ) : (
          <ConversationThread key={id} id={id} />
        )}
      </section>
    </div>
  );
}
